import type { ReasonChip, Tier } from "@/lib/constants";
import { REASON_CHIPS } from "@/lib/constants";
import type {
  Answers,
  ConditionCheck,
  ConditionStatus,
  Product,
  Reason,
  Recommendation,
  RecommendResult,
} from "./types";
import { computeCost } from "./cost";
import {
  conditionStatus as summarizeConditionStatus,
  DELIVERY_BUCKET_DAYS,
  requiredChecks,
  runChecks,
} from "./filter";
import { scoreProduct, type ScoreResult } from "./score";
import { buildCautions, buildFinalJudgment, buildFitReasons } from "./reasons";
import { buildRelaxSuggestions } from "./relax";
import {
  CRITERION_LABELS,
  criterionStatus,
  REACTION_RULES,
} from "./criteria";
import type {
  Bucket,
  CriteriaCheck,
  CriterionContext,
  CriterionKey,
  CriterionSuggestion,
  LoopRecommendation,
  RankChange,
  SessionCriteria,
} from "./criteria";

/**
 * 추천 파이프라인 (기획서 §9):
 * 필수조건 필터 → 선호 가점·리스크 감점 → 티어 → 근거 생성 → 상위 3.
 */

/** 티어 판정에 쓰는 "실질적인 주의" 개수 */
function materialCautionCount(
  p: Product,
  answers: Answers,
  unknownParts: string[],
  scoreResult: ScoreResult
): number {
  let count = 0;
  if (unknownParts.length > 0) count++;
  if (
    answers.storage === "robot_vacuum" &&
    p.robot_vacuum_fit === "check_height"
  ) {
    count++;
  }
  if (scoreResult.riskHits.some((h) => h.penalty >= 2)) count++;
  if (
    answers.delivery !== "any" &&
    p.delivery_days_max === DELIVERY_BUCKET_DAYS[answers.delivery]
  ) {
    count++;
  }
  if (answers.carry === "friend" && p.carry_difficulty === "hard") {
    count++;
  }
  return count;
}

/** 정렬용 데이터 완성도. 상품 간 동률 해소에만 쓰며 신뢰도 퍼센트가 아니다. */
export function dataCompletenessScore(p: Product, unknownParts: string[]): number {
  const inspectable = [
    p.width_cm,
    p.length_cm,
    p.height_cm,
    p.material,
    p.storage_capacity,
    p.dust_blocking,
    p.cleaning_ease,
    p.robot_vacuum_fit,
    p.carry_difficulty,
    p.self_assembly,
    p.disassembly_ease,
    p.source_note,
  ];
  const known = inspectable.filter((value) => value !== null).length;
  return (
    known +
    (p.data_confidence === "confirmed" ? 2 : 0) -
    unknownParts.length -
    (p.unknown_fields?.length ?? 0)
  );
}

/** 상품 하나를 평가 — 결과·상세·비교 화면이 공용으로 사용 */
export function evaluateProduct(p: Product, answers: Answers): Recommendation {
  const cost = computeCost(p, answers);
  const checks = runChecks(p, answers, cost);
  const status = summarizeConditionStatus(checks);
  const scoreResult = scoreProduct(p, answers, cost);

  let tier: Tier;
  if (status === "not_met") {
    tier = "not_fit";
  } else if (status === "unknown") {
    tier = "conditional";
  } else {
    const material = materialCautionCount(
      p,
      answers,
      cost.unknownParts,
      scoreResult
    );
    tier =
      scoreResult.prefHits.length >= 2 && material === 0
        ? "great"
        : "conditional";
  }

  const fitReasons = buildFitReasons(p, answers, cost);
  const cautions = buildCautions(p, answers, cost, scoreResult);
  const required = requiredChecks(checks);

  return {
    product: p,
    tier,
    conditionStatus: status,
    score: scoreResult.score,
    cost,
    checks,
    passCount: required.filter((item) => item.status === "met").length,
    totalChecks: required.length,
    unknownCount: required.filter((item) => item.status === "unknown").length,
    dataCompleteness: dataCompletenessScore(p, cost.unknownParts),
    prefCount: scoreResult.prefHits.length,
    riskCount: scoreResult.riskCount,
    fitReasons,
    cautions,
    finalJudgment: buildFinalJudgment(tier, fitReasons, cautions, checks),
  };
}

const TIER_RANK: Record<Tier, number> = { great: 2, conditional: 1, not_fit: 0 };

/**
 * 후보 정렬 비교자 (모듈 내부에서 쓰던 것을 추가로 export — 동작 변화 없는 확장).
 * 반응 루프(evaluatePool/finalizeShortlist)가 arm A와 완전히 같은 순서 규칙을 쓰게 한다.
 */
export function compareRecommendations(
  a: Recommendation,
  b: Recommendation
): number {
  return (
    TIER_RANK[b.tier] - TIER_RANK[a.tier] ||
    b.score - a.score ||
    b.dataCompleteness - a.dataCompleteness ||
    a.cost.knownTotal - b.cost.knownTotal ||
    a.product.delivery_days_max - b.product.delivery_days_max ||
    a.product.name.localeCompare(b.product.name, "ko") ||
    a.product.id.localeCompare(b.product.id)
  );
}

/** 후보 3개 추천 (화면6) */
export function recommend(
  products: Product[],
  answers: Answers
): RecommendResult {
  const pub = products.filter((p) => p.status === "public");
  const evaluated = pub.map((p) => evaluateProduct(p, answers));
  const confirmed = evaluated
    .filter((item) => item.conditionStatus === "met")
    .sort(compareRecommendations);
  const needsConfirmation = evaluated
    .filter((item) => item.conditionStatus === "unknown")
    .sort(compareRecommendations);

  const candidates = confirmed.slice(0, 3);
  if (candidates.length < 3) {
    candidates.push(...needsConfirmation.slice(0, 3 - candidates.length));
  }
  const eligibleCount = confirmed.length + needsConfirmation.length;
  return {
    candidates,
    totalReviewed: pub.length,
    relaxSuggestions:
      candidates.length < 3
        ? buildRelaxSuggestions(products, answers, eligibleCount)
        : [],
  };
}

// =============================================================
// 반응 기반 추천 루프 (arm B) — 위 함수들은 그대로 두고 여기부터 확장.
// 모두 결정적이며 arm A 경로(evaluateProduct/recommend)를 호출·변경하지 않는다.
// =============================================================

/** 필수 기준 판정들을 하나의 상태로 합친다 (하나라도 not_met → not_met, unknown → unknown) */
function combineCriteriaStatus(checks: CriteriaCheck[]): ConditionStatus {
  if (checks.some((item) => item.status === "not_met")) return "not_met";
  if (checks.some((item) => item.status === "unknown")) return "unknown";
  return "met";
}

const STATUS_RANK: Record<ConditionStatus, number> = {
  not_met: 0,
  unknown: 1,
  met: 2,
};

/** 둘 중 더 나쁜(엄격한) 상태를 돌려준다: not_met < unknown < met */
function worseStatus(a: ConditionStatus, b: ConditionStatus): ConditionStatus {
  return STATUS_RANK[a] <= STATUS_RANK[b] ? a : b;
}

/**
 * 필수 기준 행의 origin(어느 반응 칩에서 왔는지)을 최선의 근거로 추정한다.
 * 선호에 같은 키가 있으면 그 origin을, 없으면 rule 표에서 그 기준을 노리는 첫 칩을 쓴다.
 * (must는 origin을 저장하지 않으므로 표시용 힌트이며, 근거가 없으면 null.)
 */
function originForKey(
  key: CriterionKey,
  criteria: SessionCriteria
): ReasonChip | null {
  const pref = criteria.prefer.find((item) => item.key === key);
  if (pref) return pref.origin;
  const rule = REACTION_RULES.find((item) => item.targetKey === key);
  return rule ? rule.chip : null;
}

/**
 * not_fit 판정의 최종 문구. 반응 기준(must)만으로 탈락하면 빈 괄호 문구를 피해
 * 기준 라벨로 설명하고, 그 외에는 기존 buildFinalJudgment를 그대로 쓴다.
 */
function loopFinalJudgment(
  tier: Tier,
  fitReasons: Reason[],
  cautions: Reason[],
  baseChecks: ConditionCheck[],
  criteriaChecks: CriteriaCheck[]
): string {
  if (tier === "not_fit") {
    const baseFailed = baseChecks.filter(
      (item) => item.required && item.status === "not_met"
    );
    if (baseFailed.length > 0) {
      return buildFinalJudgment(tier, fitReasons, cautions, baseChecks);
    }
    const labels = criteriaChecks
      .filter((item) => item.status === "not_met")
      .map((item) => item.label)
      .join(", ");
    return `필수로 정한 조건(${labels})을 충족하지 못하는 상품이에요.`;
  }
  return buildFinalJudgment(tier, fitReasons, cautions, baseChecks);
}

/**
 * 기준을 반영해 상품 하나를 평가한다 (반응 루프 전용).
 * 기존 필수조건 판정에 더해 criteria.must 기준을 별도 CriteriaCheck로 판정하고,
 * 티어·conditionStatus는 둘을 결합한다(하나라도 not_met → 비추천, unknown → 조건부).
 * 선호 가점과 tolerated 리스크 면제는 scoreProduct(criteria)가 처리한다.
 */
export function evaluateProductWithCriteria(
  p: Product,
  answers: Answers,
  criteria: SessionCriteria,
  ctx?: CriterionContext
): LoopRecommendation {
  const cost = computeCost(p, answers);
  const baseChecks = runChecks(p, answers, cost);
  const criterionCtx: CriterionContext = {
    ...ctx,
    cost,
    tolerated: criteria.tolerated,
  };
  const scoreResult = scoreProduct(p, answers, cost, criteria, criterionCtx);

  const criteriaChecks: CriteriaCheck[] = criteria.must.map((key) => ({
    key,
    label: CRITERION_LABELS[key],
    status: criterionStatus(key, p, answers, criterionCtx),
    origin: originForKey(key, criteria),
  }));

  const baseStatus = summarizeConditionStatus(baseChecks);
  const status = worseStatus(baseStatus, combineCriteriaStatus(criteriaChecks));

  let tier: Tier;
  if (status === "not_met") {
    tier = "not_fit";
  } else if (status === "unknown") {
    tier = "conditional";
  } else {
    const material = materialCautionCount(
      p,
      answers,
      cost.unknownParts,
      scoreResult
    );
    tier =
      scoreResult.prefHits.length >= 2 && material === 0
        ? "great"
        : "conditional";
  }

  const fitReasons = buildFitReasons(p, answers, cost);
  const cautions = buildCautions(p, answers, cost, scoreResult);
  const required = requiredChecks(baseChecks);

  return {
    product: p,
    tier,
    conditionStatus: status,
    score: scoreResult.score,
    cost,
    checks: baseChecks,
    passCount: required.filter((item) => item.status === "met").length,
    totalChecks: required.length,
    unknownCount: required.filter((item) => item.status === "unknown").length,
    dataCompleteness: dataCompletenessScore(p, cost.unknownParts),
    prefCount: scoreResult.prefHits.length,
    riskCount: scoreResult.riskCount,
    fitReasons,
    cautions,
    finalJudgment: loopFinalJudgment(
      tier,
      fitReasons,
      cautions,
      baseChecks,
      criteriaChecks
    ),
    criteriaChecks,
  };
}

export interface EvaluatePoolOptions {
  /** low_total_cost 백분위 계산에 쓸 풀. 생략하면 공개 후보 전체로 계산한다. */
  pool?: readonly { knownTotal: number }[];
}

/**
 * 공개 상품 전체를 기준을 반영해 평가하고 arm A와 같은 비교자로 정렬한다.
 * 제외된 후보 걸러내기는 엔진의 일이 아니다(UI가 처리) — finalizeShortlist에서 반영한다.
 */
export function evaluatePool(
  products: Product[],
  answers: Answers,
  criteria: SessionCriteria,
  opts?: EvaluatePoolOptions
): LoopRecommendation[] {
  const pub = products.filter((p) => p.status === "public");
  const pool =
    opts?.pool ??
    pub.map((p) => ({ knownTotal: computeCost(p, answers).knownTotal }));
  const ctx: CriterionContext = { pool };
  return pub
    .map((p) => evaluateProductWithCriteria(p, answers, criteria, ctx))
    .sort(compareRecommendations);
}

/**
 * 반응 루프의 마지막 2~3개 후보를 확정한다.
 * 제외된 id를 걸러낸 뒤 recommend()와 같은 방식으로 확정 충족을 먼저 채우고
 * 부족하면 unknown으로 채운다. 비추천(not_met)은 넣지 않으므로 상황에 따라 1~2개일 수 있다.
 * totalReviewed는 검토한 전체 후보 수(제외한 것 포함)다.
 */
export function finalizeShortlist(
  pool: LoopRecommendation[],
  excludedIds: Set<string> | string[]
): { candidates: LoopRecommendation[]; totalReviewed: number } {
  const excluded =
    excludedIds instanceof Set ? excludedIds : new Set(excludedIds);
  const remaining = pool.filter((rec) => !excluded.has(rec.product.id));
  const confirmed = remaining
    .filter((rec) => rec.conditionStatus === "met")
    .sort(compareRecommendations);
  const needsConfirmation = remaining
    .filter((rec) => rec.conditionStatus === "unknown")
    .sort(compareRecommendations);

  const candidates = confirmed.slice(0, 3);
  if (candidates.length < 3) {
    candidates.push(...needsConfirmation.slice(0, 3 - candidates.length));
  }
  return { candidates, totalReviewed: pool.length };
}

/**
 * 재정렬 전후 순위 변화 목록 (순위는 1부터).
 * next에 새로 들어온 항목은 prevRank=null, next에서 사라진 항목은 nextRank=null,
 * delta = prevRank - nextRank (양수 = 상승). 신규/이탈 항목의 delta는 0.
 */
export function diffRankings(
  prev: LoopRecommendation[],
  next: LoopRecommendation[]
): RankChange[] {
  const prevRankById = new Map<string, number>();
  const prevTierById = new Map<string, Tier>();
  prev.forEach((rec, index) => {
    prevRankById.set(rec.product.id, index + 1);
    prevTierById.set(rec.product.id, rec.tier);
  });
  const nextIds = new Set(next.map((rec) => rec.product.id));

  const changes: RankChange[] = [];
  next.forEach((rec, index) => {
    const id = rec.product.id;
    const nextRank = index + 1;
    const prevRank = prevRankById.has(id) ? prevRankById.get(id)! : null;
    const prevTier = prevTierById.get(id);
    changes.push({
      id,
      name: rec.product.name,
      prevRank,
      nextRank,
      delta: prevRank === null ? 0 : prevRank - nextRank,
      tierChanged: prevTier !== undefined && prevTier !== rec.tier,
    });
  });
  prev.forEach((rec, index) => {
    if (nextIds.has(rec.product.id)) return;
    changes.push({
      id: rec.product.id,
      name: rec.product.name,
      prevRank: index + 1,
      nextRank: null,
      delta: 0,
      tierChanged: false,
    });
  });
  return changes;
}

/** 받침 유무 판정 — 조사(을/를, 은/는) 선택용. 한글이 아니면 받침 없음으로 본다. */
function hasBatchim(word: string): boolean {
  if (word.length === 0) return false;
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

/**
 * 재정렬 이유를 1~3개의 한국어 문장으로 설명한다 — 결정적.
 * 1) 적용한 기준을 먼저 밝히고, 2) 가장 많이 오른 후보, 3) 비추천으로 밀려난 후보 순.
 */
export function explainRerank(
  changes: RankChange[],
  applied: { suggestion: CriterionSuggestion; bucket: Bucket }
): string[] {
  const sentences: string[] = [];
  const { suggestion, bucket } = applied;

  if (suggestion.targetKey !== null) {
    const chipLabel = REASON_CHIPS[suggestion.chip];
    const critLabel = CRITERION_LABELS[suggestion.targetKey];
    const particle = hasBatchim(critLabel) ? "을" : "를";
    const bucketWord =
      bucket === "must" ? "필수" : bucket === "prefer" ? "선호" : "감당 가능한 단점";
    sentences.push(
      `'${chipLabel}' 반응을 반영해 '${critLabel}'${particle} ${bucketWord} 조건으로 추가했어요.`
    );
  }

  const risers = changes
    .filter((change) => change.nextRank !== null && change.delta > 0)
    .sort(
      (a, b) =>
        b.delta - a.delta ||
        a.name.localeCompare(b.name, "ko") ||
        a.id.localeCompare(b.id)
    );
  if (risers.length > 0 && sentences.length < 3) {
    const top = risers[0];
    sentences.push(`'${top.name}' 후보가 ${top.delta}계단 올라왔어요.`);
  }

  const dropped = changes
    .filter((change) => change.nextRank === null)
    .sort(
      (a, b) => (a.prevRank ?? 0) - (b.prevRank ?? 0) || a.id.localeCompare(b.id)
    );
  if (dropped.length > 0 && sentences.length < 3) {
    const top = dropped[0];
    const particle = hasBatchim(top.name) ? "은" : "는";
    sentences.push(
      `'${top.name}'${particle} 필수 조건을 충족하지 못해 제외됐어요.`
    );
  }

  return sentences.slice(0, 3);
}
