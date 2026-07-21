"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { BackIcon } from "@/components/icons";
import {
  loadLastCandidateIds,
  loadLastQuery,
} from "@/components/RememberAnswers";
import {
  getCurrentRunId,
  getJourneyId,
  getSessionId,
  track,
} from "@/lib/track";
import { hasAnswers } from "@/lib/reco/answers";
import { isUuid } from "@/lib/uuid";

/**
 * 화면11 — 결과 피드백.
 * MVP 핵심 가설(시간 단축·조건 반영·이유의 유용성)을 직접 검증한다 (기획서 §12).
 * 연락처는 수집하지 않는다 — 구매 후 질문 동의도 "다음 방문 때" 방식 (기획서 §13 원칙).
 */

type ProductSummary = { id: string; name: string; seller_name: string };

const WORST_CHOICES = [
  { code: "q1", label: "질문1 (침대 밑 공간)" },
  { code: "q2", label: "질문2 (운반과 조립)" },
  { code: "q3", label: "질문3 (예산과 시기)" },
  { code: "none", label: "없었어요" },
] as const;

type WorstCode = (typeof WORST_CHOICES)[number]["code"];

/**
 * 결과 화면이 sessionStorage에 남긴 답변 쿼리를 하이드레이션 안전하게 읽는다.
 * (서버 렌더 시 "" → 클라이언트에서 실제 값으로 재렌더)
 */
const emptySubscribe = () => () => {};
function loadFeedbackQuery(): string {
  if (typeof window !== "undefined") {
    const current = new URLSearchParams(window.location.search);
    current.delete("chosen");
    if (hasAnswers(Object.fromEntries(current))) return current.toString();
  }
  return loadLastQuery();
}

function useFeedbackQuery(): string {
  return useSyncExternalStore(emptySubscribe, loadFeedbackQuery, () => "");
}

function loadRunId(): string {
  if (typeof window === "undefined") return "";
  const value = new URLSearchParams(window.location.search).get("run");
  return isUuid(value) ? value : "";
}

/** 1~5 원형 버튼 척도 문항 */
function ScaleQuestion({
  number,
  title,
  value,
  onChange,
}: {
  number: number;
  title: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <section className="rounded-3xl bg-white p-5 shadow-soft">
      <QuestionTitle number={number} title={title} required />
      <div className="mt-4 flex items-center justify-between px-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            aria-label={`${n}점${n === 1 ? " (전혀 아니에요)" : n === 5 ? " (매우 그래요)" : ""}`}
            onClick={() => onChange(n)}
            className={`h-11 w-11 rounded-full text-[15px] font-extrabold transition-colors ${
              value === n
                ? "bg-gradient-to-r from-[#C8431B] to-[#A82E0C] text-white shadow-cta"
                : "border-2 border-[#F0DACD] bg-white text-sub"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-between px-1 text-[13px] font-semibold text-faint">
        <span>전혀 아니에요</span>
        <span>매우 그래요</span>
      </div>
    </section>
  );
}

/** 예/아니오 문항 */
function YesNoQuestion({
  number,
  title,
  value,
  onChange,
}: {
  number: number;
  title: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <section className="rounded-3xl bg-white p-5 shadow-soft">
      <QuestionTitle number={number} title={title} required />
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {[
          { v: true, label: "예" },
          { v: false, label: "아니오" },
        ].map((opt) => (
          <button
            key={opt.label}
            type="button"
            aria-pressed={value === opt.v}
            onClick={() => onChange(opt.v)}
            className={`rounded-full py-3 text-[14.5px] font-extrabold transition-colors ${
              value === opt.v
                ? "bg-gradient-to-r from-[#C8431B] to-[#A82E0C] text-white shadow-cta"
                : "border-2 border-[#F0DACD] bg-white text-sub"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function QuestionTitle({
  number,
  title,
  required,
}: {
  number: number;
  title: string;
  required?: boolean;
}) {
  return (
    <p className="text-[15px] font-extrabold leading-snug">
      <span className="mr-1.5 text-coral-600">Q{number}.</span>
      {title}
      <span
        className={`ml-1.5 align-middle text-[13px] font-bold ${
          required ? "text-coral-600" : "text-faint"
        }`}
      >
        {required ? "필수" : "선택"}
      </span>
    </p>
  );
}

export default function FeedbackPage() {
  // 필수 문항
  const [timeSaved, setTimeSaved] = useState<number | null>(null);
  const [conditionsReflected, setConditionsReflected] = useState<number | null>(null);
  const [reasonsHelpful, setReasonsHelpful] = useState<number | null>(null);
  const [foundCandidate, setFoundCandidate] = useState<boolean | null>(null);
  const [wouldReuse, setWouldReuse] = useState<boolean | null>(null);
  const [worstChoice, setWorstChoice] = useState<WorstCode | null>(null);
  const [worstText, setWorstText] = useState("");

  // 선택 문항
  const [chosenId, setChosenId] = useState<string>(""); // "" = 건너뛰기
  const [optin, setOptin] = useState(false);

  // 화면 상태
  const [candidates, setCandidates] = useState<ProductSummary[]>([]);
  const lastQuery = useFeedbackQuery();
  const runId = useSyncExternalStore(emptySubscribe, loadRunId, () => "");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const chosenFromUrl = new URLSearchParams(window.location.search).get(
      "chosen"
    );
    const preferredId = isUuid(chosenFromUrl) ? chosenFromUrl : null;
    const ids = [
      ...new Set([
        ...(preferredId ? [preferredId] : []),
        ...loadLastCandidateIds(),
      ]),
    ];
    if (ids.length === 0) return;
    fetch(`/api/products?ids=${ids.join(",")}`)
      .then((res) => (res.ok ? res.json() : { products: [] }))
      .then((data: { products?: unknown }) => {
        if (Array.isArray(data.products)) {
          const products = data.products as ProductSummary[];
          setCandidates(products);
          if (preferredId && products.some((p) => p.id === preferredId)) {
            setChosenId(preferredId);
          }
        }
      })
      .catch(() => {
        // 이름을 못 불러오면 ⑦ 문항을 숨긴다 — 제출은 막지 않는다
      });
  }, []);

  const backHref = runId
    ? `/results/${runId}`
    : lastQuery
      ? `/results?${lastQuery}`
      : "/";
  const missingCount = useMemo(
    () =>
      [
        timeSaved,
        conditionsReflected,
        reasonsHelpful,
        foundCandidate,
        wouldReuse,
        worstChoice,
      ].filter((v) => v === null).length,
    [timeSaved, conditionsReflected, reasonsHelpful, foundCandidate, wouldReuse, worstChoice]
  );
  const canSubmit = missingCount === 0 && !submitting;

  const worstQuestionValue = (): string | null => {
    const label =
      WORST_CHOICES.find((c) => c.code === worstChoice)?.label ?? null;
    const text = worstText.trim();
    if (label && text) return `${label} — ${text}`.slice(0, 500);
    if (text) return text.slice(0, 500);
    return label;
  };

  const onSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: getSessionId(),
          journey_id: getJourneyId(),
          run_id: runId || getCurrentRunId(),
          q_time_saved: timeSaved,
          q_conditions_reflected: conditionsReflected,
          q_reasons_helpful: reasonsHelpful,
          q_found_candidate: foundCandidate,
          q_would_reuse: wouldReuse,
          q_worst_question: worstQuestionValue(),
          chosen_product_id: chosenId || null,
          post_purchase_optin: optin,
        }),
      });
      if (!res.ok) throw new Error(`feedback ${res.status}`);
      track(
        "feedback_submit",
        {
          foundCandidate,
          wouldReuse,
          postPurchaseOptin: optin,
          choseProduct: Boolean(chosenId),
        },
        { runId: runId || getCurrentRunId() }
      );
      setSubmitted(true);
      window.scrollTo({ top: 0 });
    } catch {
      setError(
        "후기를 저장하지 못했어요. 데모 또는 데이터 저장소 미설정 상태일 수 있어요. 잠시 후 다시 시도해주세요."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- 감사 화면 ----------
  if (submitted) {
    return (
      <main className="flex min-h-dvh flex-col justify-center px-5 pb-16">
        <div className="rounded-[28px] bg-white p-8 text-center shadow-card">
          <p className="text-[44px]">🙏</p>
          <h1 className="mt-3 text-[20px] font-extrabold">답변이 저장됐어요</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-sub">
            더 나은 추천으로 보답할게요.
            {optin && (
              <>
                <br />
                다음에 방문하시면 사용 경험을 여쭤볼게요.
              </>
            )}
          </p>
          <div className="mt-6 space-y-2.5">
            <Link
              href="/"
              className="block w-full rounded-full bg-gradient-to-r from-[#C8431B] to-[#A82E0C] py-4 text-center text-[16px] font-extrabold text-white shadow-cta"
            >
              처음으로
            </Link>
            {(runId || lastQuery) && (
              <Link
                href={runId ? `/results/${runId}` : `/results?${lastQuery}`}
                className="block w-full rounded-full border-2 border-peach-200 bg-white py-3.5 text-center text-[14.5px] font-bold text-coral-700"
              >
                결과로 돌아가기
              </Link>
            )}
          </div>
        </div>
      </main>
    );
  }

  // ---------- 피드백 폼 ----------
  return (
    <main className="min-h-dvh pb-14">
      {/* 상단 바 */}
      <div className="flex items-center gap-3 px-5 pt-6">
        <Link
          href={backHref}
          aria-label="뒤로가기"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-soft"
        >
          <BackIcon size={18} />
        </Link>
        <h1 className="text-[18px] font-extrabold">사용 후기</h1>
      </div>

      <p className="px-6 pt-4 text-[14px] leading-relaxed text-sub">
        1분이면 끝나요. 답변은 익명으로 저장되고, 더 나은 추천을 만드는 데만
        써요 😊
      </p>

      <div className="mt-4 space-y-3.5 px-5">
        <ScaleQuestion
          number={1}
          title="이 서비스가 후보를 정하는 시간을 줄였나요?"
          value={timeSaved}
          onChange={setTimeSaved}
        />
        <ScaleQuestion
          number={2}
          title="내 조건이 잘 반영됐나요?"
          value={conditionsReflected}
          onChange={setConditionsReflected}
        />
        <ScaleQuestion
          number={3}
          title="맞는 이유·안 맞는 이유가 도움이 됐나요?"
          value={reasonsHelpful}
          onChange={setReasonsHelpful}
        />
        <YesNoQuestion
          number={4}
          title="추천 후보 중 실제로 고려할 상품이 있었나요?"
          value={foundCandidate}
          onChange={setFoundCandidate}
        />
        <YesNoQuestion
          number={5}
          title="다른 가구를 살 때도 쓰고 싶나요?"
          value={wouldReuse}
          onChange={setWouldReuse}
        />

        {/* ⑥ 가장 불필요/피곤했던 질문 */}
        <section className="rounded-3xl bg-white p-5 shadow-soft">
          <QuestionTitle
            number={6}
            title="가장 불필요하거나 피곤했던 질문은?"
            required
          />
          <div className="mt-4 flex flex-wrap gap-2">
            {WORST_CHOICES.map((c) => (
              <button
                key={c.code}
                type="button"
                aria-pressed={worstChoice === c.code}
                onClick={() => setWorstChoice(c.code)}
                className={`rounded-full px-4 py-2.5 text-[13.5px] font-bold transition-colors ${
                  worstChoice === c.code
                    ? "bg-gradient-to-r from-[#C8431B] to-[#A82E0C] text-white shadow-cta"
                    : "border-2 border-[#F0DACD] bg-white text-sub"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={worstText}
            onChange={(e) => setWorstText(e.target.value)}
            maxLength={500}
            placeholder="직접 입력 (선택)"
            className="mt-3 w-full rounded-2xl border-2 border-[#F0DACD] bg-cream px-4 py-3 text-[14px] font-medium placeholder:text-faint focus:border-coral-400 focus:outline-none"
          />
        </section>

        {/* ⑦ 가장 마음에 든 상품 — 후보가 있을 때만 */}
        {candidates.length > 0 && (
          <section className="rounded-3xl bg-white p-5 shadow-soft">
            <QuestionTitle number={7} title="가장 마음에 든 상품이 있다면?" />
            <div className="mt-4 space-y-2">
              {candidates.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={chosenId === p.id}
                  onClick={() => setChosenId(p.id)}
                  className={`flex w-full items-center gap-2.5 rounded-2xl px-4 py-3 text-left transition-colors ${
                    chosenId === p.id
                      ? "bg-peach-50 ring-2 ring-coral-400"
                      : "border-2 border-[#F0DACD] bg-white"
                  }`}
                >
                  <span
                    className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                      chosenId === p.id
                        ? "border-coral-600 bg-coral-600 ring-2 ring-inset ring-white"
                        : "border-[#E0D3C2] bg-white"
                    }`}
                  />
                  <span>
                    <span className="block text-[14px] font-bold leading-snug">
                      {p.name}
                    </span>
                    <span className="block text-[13px] font-medium text-faint">
                      {p.seller_name}
                    </span>
                  </span>
                </button>
              ))}
              <button
                type="button"
                aria-pressed={chosenId === ""}
                onClick={() => setChosenId("")}
                className={`w-full rounded-2xl px-4 py-3 text-[13.5px] font-bold transition-colors ${
                  chosenId === ""
                    ? "bg-[#F4EDE3] text-[#4A4038]"
                    : "border-2 border-[#F0DACD] bg-white text-faint"
                }`}
              >
                아직 없어요 · 건너뛰기
              </button>
            </div>
          </section>
        )}

        {/* ⑧ 구매 후 경험 질문 동의 */}
        <label className="flex cursor-pointer items-start gap-3 rounded-3xl bg-white p-5 shadow-soft">
          <input
            type="checkbox"
            checked={optin}
            onChange={(e) => setOptin(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[#F4552E]"
          />
          <span>
            <span className="block text-[14.5px] font-extrabold leading-snug">
              구매 후 2~4주 뒤 사용 경험을 물어봐도 될까요?
              <span className="ml-1.5 align-middle text-[13px] font-bold text-faint">
                선택
              </span>
            </span>
            <span className="mt-1 block text-[13px] leading-relaxed text-faint">
              연락처는 받지 않아요 — 다음 방문 때 물어볼게요.
            </span>
          </span>
        </label>
      </div>

      {/* 제출 */}
      <div className="mt-6 px-5">
        {error && (
          <p role="alert" className="mb-2.5 rounded-2xl bg-[#FCE8E4] px-4 py-3 text-center text-[13px] font-bold text-coral-700">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className={`w-full rounded-full py-4 text-[17px] font-extrabold transition-colors ${
            canSubmit
              ? "bg-gradient-to-r from-[#C8431B] to-[#A82E0C] text-white shadow-cta"
              : "bg-[#EFE7DA] text-faint"
          }`}
        >
          {submitting ? "저장하는 중…" : "후기 보내기"}
        </button>
        {missingCount > 0 && (
          <p className="mt-2.5 text-center text-[13px] font-semibold text-faint">
            필수 문항 {missingCount}개에 답해주시면 보낼 수 있어요
          </p>
        )}
      </div>
    </main>
  );
}
