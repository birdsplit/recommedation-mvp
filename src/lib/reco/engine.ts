import type { Tier } from "@/lib/constants";
import type {
  Answers,
  Product,
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

function compareRecommendations(a: Recommendation, b: Recommendation): number {
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
