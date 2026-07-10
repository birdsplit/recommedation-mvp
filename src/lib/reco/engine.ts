import type { Tier } from "@/lib/constants";
import type {
  Answers,
  Product,
  Recommendation,
  RecommendResult,
} from "./types";
import { computeCost } from "./cost";
import { DELIVERY_BUCKET_DAYS, passesAll, runChecks } from "./filter";
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
  if (answers.carry === "friend_help" && p.carry_difficulty === "hard") {
    count++;
  }
  return count;
}

/** 상품 하나를 평가 — 결과·상세·비교 화면이 공용으로 사용 */
export function evaluateProduct(p: Product, answers: Answers): Recommendation {
  const cost = computeCost(p, answers);
  const checks = runChecks(p, answers, cost);
  const pass = passesAll(checks);
  const scoreResult = scoreProduct(p, answers, cost);

  let tier: Tier;
  if (!pass) {
    tier = "not_fit";
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

  return {
    product: p,
    tier,
    score: scoreResult.score,
    cost,
    checks,
    passCount: checks.filter((c) => c.pass).length,
    totalChecks: checks.length,
    prefCount: scoreResult.prefHits.length,
    riskCount: scoreResult.riskCount,
    fitReasons,
    cautions,
    finalJudgment: buildFinalJudgment(tier, fitReasons, cautions, checks),
  };
}

const TIER_RANK: Record<Tier, number> = { great: 2, conditional: 1, not_fit: 0 };

/** 후보 3개 추천 (화면6) */
export function recommend(
  products: Product[],
  answers: Answers
): RecommendResult {
  const pub = products.filter((p) => p.status === "public");
  const passing = pub
    .map((p) => evaluateProduct(p, answers))
    .filter((r) => r.tier !== "not_fit");

  passing.sort(
    (a, b) =>
      TIER_RANK[b.tier] - TIER_RANK[a.tier] ||
      b.score - a.score ||
      a.cost.knownTotal - b.cost.knownTotal ||
      a.product.name.localeCompare(b.product.name, "ko")
  );

  const candidates = passing.slice(0, 3);
  return {
    candidates,
    totalReviewed: pub.length,
    relaxSuggestions:
      candidates.length < 3
        ? buildRelaxSuggestions(products, answers, passing.length)
        : [],
  };
}
