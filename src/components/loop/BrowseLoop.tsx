"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { REVIEW_RISKS, type ReasonChip, type ReviewRisk } from "@/lib/constants";
import {
  applyConfirmation,
  CRITERION_LABELS,
  deriveSuggestions,
  tolerateRisk,
  type CriterionKey,
  type LoopRecommendation,
  type RankChange,
  type ReactionKind,
  type SessionCriteria,
} from "@/lib/reco/criteria";
import {
  diffRankings,
  evaluatePool,
  explainRerank,
  finalizeShortlist,
} from "@/lib/reco/engine";
import { computeCost } from "@/lib/reco/cost";
import type { Answers, Product } from "@/lib/reco/types";
import {
  getJourneyId,
  getSessionId,
  setCurrentRunId,
  track,
} from "@/lib/track";
import { CandidateCard } from "./CandidateCard";
import { ConfirmationCard } from "./ConfirmationCard";
import { CriteriaBoard } from "./CriteriaBoard";
import { ReasonChips } from "./ReasonChips";
import { useReactionState, type LoopState } from "./useReactionState";

/** 받침 유무 — 조사(을/를) 선택용. 한글이 아니면 받침 없음으로 본다. */
function hasBatchim(word: string): boolean {
  if (word.length === 0) return false;
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

/** 재정렬에서 가장 많이 오른 후보 한 줄 (없으면 null) — explainRerank의 riser 규칙과 동일. */
function riserLine(changes: RankChange[]): string | null {
  const risers = changes
    .filter((change) => change.nextRank !== null && change.delta > 0)
    .sort(
      (a, b) =>
        b.delta - a.delta ||
        a.name.localeCompare(b.name, "ko") ||
        a.id.localeCompare(b.id)
    );
  if (risers.length === 0) return null;
  const top = risers[0];
  return `'${top.name}' 후보가 ${top.delta}계단 올라왔어요.`;
}

function movedCount(changes: RankChange[]): number {
  return changes.filter((change) => change.prevRank !== change.nextRank).length;
}

function topIds(pool: LoopRecommendation[]): string[] {
  return pool.slice(0, 5).map((rec) => rec.product.id);
}

/**
 * 최종 후보 구성 (클라이언트 미리보기용 — 서버 /api/loop/finalize가 권위 있는 스냅샷을 만든다).
 * (1) 저장한 후보를 풀 순위대로, 제외 제외, 티어 무관 포함 →
 * (2) 저장·제외를 뺀 나머지에서 finalizeShortlist로 최대 3개까지 백필.
 */
function composeShortlist(
  pool: LoopRecommendation[],
  savedIds: string[],
  excludedIds: string[]
): LoopRecommendation[] {
  const savedSet = new Set(savedIds);
  const excludedSet = new Set(excludedIds);
  const saved = pool.filter(
    (rec) => savedSet.has(rec.product.id) && !excludedSet.has(rec.product.id)
  );
  const rest = pool.filter((rec) => !savedSet.has(rec.product.id));
  const backfill = finalizeShortlist(rest, excludedSet).candidates;
  const candidates = [...saved];
  for (const rec of backfill) {
    if (candidates.length >= 3) break;
    if (candidates.some((item) => item.product.id === rec.product.id)) continue;
    candidates.push(rec);
  }
  return candidates.slice(0, 3);
}

function withMembership(list: string[], id: string, member: boolean): string[] {
  if (member) return list.includes(id) ? list : [...list, id];
  return list.filter((item) => item !== id);
}

function reduceReaction(
  prev: LoopState,
  productId: string,
  kind: ReactionKind,
  chips: ReasonChip[]
): LoopState {
  return {
    ...prev,
    reactions: [
      ...prev.reactions.filter((reaction) => reaction.productId !== productId),
      { productId, kind, chips },
    ],
    savedIds: withMembership(prev.savedIds, productId, kind === "save"),
    heldIds: withMembership(prev.heldIds, productId, kind === "hold"),
    excludedIds: withMembership(prev.excludedIds, productId, kind === "exclude"),
  };
}

export function BrowseLoop({
  products,
  answers,
  intakeQuery,
}: {
  products: Product[];
  answers: Answers;
  intakeQuery: string;
}) {
  const router = useRouter();
  const [state, setState] = useReactionState();
  const [pending, setPending] = useState<{
    productId: string;
    kind: ReactionKind;
  } | null>(null);
  const [bannerVisible, setBannerVisible] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  const criteria = state.criteria;

  // low_total_cost 백분위는 공개 후보 전체(제외와 무관)로 고정해 안정적으로 계산한다.
  const costPool = useMemo(
    () =>
      products.map((p) => ({ knownTotal: computeCost(p, answers).knownTotal })),
    [products, answers]
  );
  const ranked = useMemo(
    () => evaluatePool(products, answers, criteria, { pool: costPool }),
    [products, answers, criteria, costPool]
  );

  const excludedSet = useMemo(
    () => new Set(state.excludedIds),
    [state.excludedIds]
  );
  const savedSet = useMemo(() => new Set(state.savedIds), [state.savedIds]);
  const heldSet = useMemo(() => new Set(state.heldIds), [state.heldIds]);

  const excludedRecs = ranked.filter((rec) => excludedSet.has(rec.product.id));
  const activeRecs = ranked.filter((rec) => !excludedSet.has(rec.product.id));
  const eligibleRecs = activeRecs.filter(
    (rec) => rec.conditionStatus !== "not_met"
  );
  const ineligibleRecs = activeRecs.filter(
    (rec) => rec.conditionStatus === "not_met"
  );

  const suggestions = useMemo(
    () =>
      deriveSuggestions(state.reactions, criteria, state.answeredSuggestionIds),
    [state.reactions, criteria, state.answeredSuggestionIds]
  );
  const activeSuggestion = suggestions[0] ?? null;

  const presentRisks = new Set<ReviewRisk>();
  for (const rec of eligibleRecs) {
    for (const risk of rec.product.review_risks) presentRisks.add(risk);
  }
  for (const risk of criteria.tolerated) presentRisks.add(risk);
  const poolRisks = (Object.keys(REVIEW_RISKS) as ReviewRisk[]).filter((risk) =>
    presentRisks.has(risk)
  );

  // 새 확인 카드가 뜨는 순간 criteria_prompt를 1회 기록한다.
  const promptedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeSuggestion) {
      promptedRef.current = null;
      return;
    }
    if (promptedRef.current === activeSuggestion.id) return;
    promptedRef.current = activeSuggestion.id;
    track("criteria_prompt", {
      suggestionId: activeSuggestion.id,
      chip: activeSuggestion.chip,
      targetKey: activeSuggestion.targetKey,
    });
  }, [activeSuggestion]);

  const commitReaction = (
    productId: string,
    kind: ReactionKind,
    chips: ReasonChip[]
  ) => {
    const cappedChips = chips.slice(0, 3);
    const next = reduceReaction(state, productId, kind, cappedChips);
    setState(next);
    track("candidate_reaction", {
      productId,
      kind,
      chips: cappedChips,
      savedCount: next.savedIds.length,
      excludedCount: next.excludedIds.length,
      heldCount: next.heldIds.length,
    });
  };

  const clearReaction = (productId: string) => {
    setState({
      ...state,
      reactions: state.reactions.filter(
        (reaction) => reaction.productId !== productId
      ),
      savedIds: state.savedIds.filter((id) => id !== productId),
      heldIds: state.heldIds.filter((id) => id !== productId),
      excludedIds: state.excludedIds.filter((id) => id !== productId),
    });
  };

  const rerank = (nextCriteria: SessionCriteria) => {
    const nextPool = evaluatePool(products, answers, nextCriteria, {
      pool: costPool,
    });
    return { nextPool, changes: diffRankings(ranked, nextPool) };
  };

  const answerSuggestion = (answer: "must" | "prefer" | "no") => {
    if (!activeSuggestion) return;
    const suggestion = activeSuggestion;
    const answeredSuggestionIds = state.answeredSuggestionIds.includes(
      suggestion.id
    )
      ? state.answeredSuggestionIds
      : [...state.answeredSuggestionIds, suggestion.id];

    if (answer === "no") {
      setState({ ...state, answeredSuggestionIds });
      track("criteria_confirm", {
        suggestionId: suggestion.id,
        targetKey: suggestion.targetKey,
        bucket: "dismissed",
      });
      return;
    }

    const nextCriteria = applyConfirmation(criteria, suggestion, answer);
    const { nextPool, changes } = rerank(nextCriteria);
    setState({
      ...state,
      criteria: nextCriteria,
      answeredSuggestionIds,
      lastExplanations: explainRerank(changes, { suggestion, bucket: answer }),
    });
    setBannerVisible(true);
    track("criteria_confirm", {
      suggestionId: suggestion.id,
      targetKey: suggestion.targetKey,
      bucket: answer,
    });
    track("candidates_rerank", {
      trigger: suggestion.id,
      movedCount: movedCount(changes),
      topIds: topIds(nextPool),
    });
  };

  const commitCriteria = (
    nextCriteria: SessionCriteria,
    baseSentence: string,
    trigger: string
  ) => {
    const { nextPool, changes } = rerank(nextCriteria);
    const explanations = [baseSentence, riserLine(changes)].filter(
      (line): line is string => Boolean(line)
    );
    setState({ ...state, criteria: nextCriteria, lastExplanations: explanations });
    setBannerVisible(true);
    track("candidates_rerank", {
      trigger,
      movedCount: movedCount(changes),
      topIds: topIds(nextPool),
    });
  };

  const removeMust = (key: CriterionKey) => {
    commitCriteria(
      { ...criteria, must: criteria.must.filter((item) => item !== key) },
      `'${CRITERION_LABELS[key]}' 필수 조건을 없앴어요.`,
      `remove_must_${key}`
    );
  };

  const removePrefer = (key: CriterionKey) => {
    commitCriteria(
      {
        ...criteria,
        prefer: criteria.prefer.filter((pref) => pref.key !== key),
      },
      `'${CRITERION_LABELS[key]}' 선호 조건을 없앴어요.`,
      `remove_prefer_${key}`
    );
  };

  const toggleTolerated = (risk: ReviewRisk) => {
    const has = criteria.tolerated.includes(risk);
    const label = REVIEW_RISKS[risk];
    const particle = hasBatchim(label) ? "을" : "를";
    const nextCriteria = has
      ? {
          ...criteria,
          tolerated: criteria.tolerated.filter((item) => item !== risk),
        }
      : tolerateRisk(criteria, risk);
    commitCriteria(
      nextCriteria,
      has
        ? `'${label}'${particle} 다시 신경 쓰는 단점으로 되돌렸어요.`
        : `'${label}'${particle} 감당 가능한 단점으로 표시했어요.`,
      `${has ? "untolerate" : "tolerate"}_${risk}`
    );
  };

  const restoreAllExcluded = () => {
    const excludedIds = new Set(state.excludedIds);
    setState({
      ...state,
      reactions: state.reactions.filter(
        (reaction) => !excludedIds.has(reaction.productId)
      ),
      excludedIds: [],
    });
  };

  const finalize = async () => {
    if (finalizing) return;
    setFinalizing(true);
    setFinalizeError(null);
    const preview = composeShortlist(
      ranked,
      state.savedIds,
      state.excludedIds
    );
    const candidateIds = preview.map((rec) => rec.product.id).slice(0, 3);
    track("shortlist_finalize", {
      candidateIds,
      count: candidateIds.length,
      mustCount: criteria.must.length,
      preferCount: criteria.prefer.length,
      toleratedCount: criteria.tolerated.length,
    });
    try {
      const response = await fetch("/api/loop/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers,
          criteria,
          savedIds: state.savedIds.slice(0, 50),
          excludedIds: state.excludedIds.slice(0, 50),
          session_id: getSessionId(),
          journey_id: getJourneyId(),
        }),
      });
      if (!response.ok) throw new Error(`finalize ${response.status}`);
      const data = (await response.json()) as {
        results_url?: unknown;
        run_id?: unknown;
      };
      if (typeof data.results_url !== "string") throw new Error("missing url");
      setCurrentRunId(typeof data.run_id === "string" ? data.run_id : null);
      router.push(data.results_url);
    } catch {
      setFinalizeError(
        "최종 후보를 만들지 못했어요. 잠시 후 다시 시도해 주세요."
      );
      setFinalizing(false);
    }
  };

  const reactionOf = (id: string): "save" | "hold" | null =>
    savedSet.has(id) ? "save" : heldSet.has(id) ? "hold" : null;

  return (
    <div className="px-5 pb-36">
      <CriteriaBoard
        criteria={criteria}
        answers={answers}
        intakeQuery={intakeQuery}
        poolRisks={poolRisks}
        onRemoveMust={removeMust}
        onRemovePrefer={removePrefer}
        onToggleTolerated={toggleTolerated}
      />

      {bannerVisible && state.lastExplanations.length > 0 && (
        <div
          role="status"
          className="mt-3 rounded-[20px] border border-[#B9DFC5] bg-leaf-50 p-4"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13px] font-extrabold text-[#135D35]">
              기준을 반영해 다시 정리했어요
            </p>
            <button
              type="button"
              aria-label="설명 닫기"
              onClick={() => setBannerVisible(false)}
              className="text-[13px] font-extrabold text-[#135D35]"
            >
              ✕
            </button>
          </div>
          <ul className="mt-1.5 space-y-1">
            {state.lastExplanations.map((line) => (
              <li
                key={line}
                className="text-[13px] leading-relaxed text-[#1c6a3f]"
              >
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}

      {activeSuggestion && (
        <ConfirmationCard
          suggestion={activeSuggestion}
          onAnswer={answerSuggestion}
        />
      )}

      {eligibleRecs.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {eligibleRecs.map((rec) => (
            <li key={rec.product.id}>
              <CandidateCard
                rec={rec}
                reaction={reactionOf(rec.product.id)}
                onReact={(kind) =>
                  setPending({ productId: rec.product.id, kind })
                }
                onClearReaction={() => clearReaction(rec.product.id)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          criteria={criteria}
          excludedCount={excludedRecs.length}
          onRemoveMust={removeMust}
          onRestore={restoreAllExcluded}
        />
      )}

      {ineligibleRecs.length > 0 && (
        <details className="mt-4 rounded-[20px] border border-[#EADFD2] bg-white/70 px-4 py-3">
          <summary className="cursor-pointer text-[13px] font-extrabold text-faint">
            지금 조건에 맞지 않는 침대 {ineligibleRecs.length}개
          </summary>
          <ul className="mt-2 space-y-1.5">
            {ineligibleRecs.map((rec) => (
              <li
                key={rec.product.id}
                className="text-[13px] leading-relaxed text-sub"
              >
                <b className="font-extrabold">{rec.product.name}</b> ·{" "}
                {rec.finalJudgment}
              </li>
            ))}
          </ul>
        </details>
      )}

      {excludedRecs.length > 0 && (
        <details className="mt-3 rounded-[20px] border border-[#EADFD2] bg-white/70 px-4 py-3">
          <summary className="cursor-pointer text-[13px] font-extrabold text-faint">
            제외됨 {excludedRecs.length}개
          </summary>
          <ul className="mt-2 space-y-2">
            {excludedRecs.map((rec) => (
              <li
                key={rec.product.id}
                className="flex items-center justify-between gap-3"
              >
                <span className="text-[13px] font-semibold">
                  {rec.product.name}
                </span>
                <button
                  type="button"
                  onClick={() => clearReaction(rec.product.id)}
                  className="shrink-0 rounded-full border border-[#D9BDAE] px-3 py-1 text-[12px] font-bold text-coral-700"
                >
                  되돌리기
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30">
        <div className="mx-auto max-w-[430px] border-t border-[#EADFD2] bg-cream/95 px-5 pb-5 pt-3 backdrop-blur">
          {finalizeError && (
            <p
              role="alert"
              className="mb-2 rounded-2xl bg-[#FCE8E4] px-4 py-2.5 text-center text-[13px] font-bold text-coral-700"
            >
              {finalizeError}
            </p>
          )}
          <button
            type="button"
            onClick={finalize}
            disabled={finalizing}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#C8431B] to-[#A82E0C] py-4 text-[17px] font-extrabold text-white shadow-cta disabled:cursor-wait disabled:opacity-70"
          >
            {finalizing
              ? "최종 후보를 정리하는 중…"
              : `최종 후보 보기 (저장 ${state.savedIds.length})`}
          </button>
        </div>
      </div>

      {pending && (
        <ReasonChips
          kind={pending.kind}
          onConfirm={(chips) => {
            commitReaction(pending.productId, pending.kind, chips);
            setPending(null);
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

function EmptyState({
  criteria,
  excludedCount,
  onRemoveMust,
  onRestore,
}: {
  criteria: SessionCriteria;
  excludedCount: number;
  onRemoveMust: (key: CriterionKey) => void;
  onRestore: () => void;
}) {
  if (criteria.must.length > 0) {
    return (
      <div
        role="status"
        className="mt-4 rounded-[24px] bg-white p-6 text-center shadow-card"
      >
        <p className="text-[32px]" aria-hidden="true">
          🔍
        </p>
        <h2 className="mt-2 text-[17px] font-extrabold">
          필수 조건이 후보를 모두 걸렀어요
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-sub">
          조건을 빼면 후보가 돌아와요. 아래에서 필수 조건을 하나씩 풀어보세요.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {criteria.must.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onRemoveMust(key)}
              className="rounded-full border-2 border-coral-500 bg-white px-4 py-2 text-[13px] font-extrabold text-coral-700"
            >
              {CRITERION_LABELS[key]} 빼기
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (excludedCount > 0) {
    return (
      <div
        role="status"
        className="mt-4 rounded-[24px] bg-white p-6 text-center shadow-card"
      >
        <p className="text-[32px]" aria-hidden="true">
          🗂️
        </p>
        <h2 className="mt-2 text-[17px] font-extrabold">
          남은 후보를 모두 제외했어요
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-sub">
          제외를 되돌리면 후보가 다시 나타나요.
        </p>
        <button
          type="button"
          onClick={onRestore}
          className="mt-4 rounded-full border-2 border-coral-500 bg-white px-5 py-2.5 text-[14px] font-extrabold text-coral-700"
        >
          제외 모두 되돌리기
        </button>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="mt-4 rounded-[24px] bg-white p-6 text-center shadow-card"
    >
      <p className="text-[32px]" aria-hidden="true">
        🔍
      </p>
      <h2 className="mt-2 text-[17px] font-extrabold">
        지금 조건에 맞는 후보가 없어요
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-sub">
        기본 조건을 넓히면 후보가 더 나타나요. 기준판의 &lsquo;수정&rsquo;에서
        조건을 바꿔보세요.
      </p>
    </div>
  );
}
