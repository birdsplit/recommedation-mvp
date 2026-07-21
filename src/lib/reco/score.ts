import type { ReviewRisk } from "@/lib/constants";
import type { Answers, CostBreakdown, Product } from "./types";
import { DELIVERY_BUCKET_DAYS } from "./filter";

/**
 * 선호 가점(§9.2)과 리스크 감점(§9.3).
 * 점수는 후보 정렬에만 쓰고 UI에 숫자로 노출하지 않는다 (화면6 표시 원칙).
 */

/** 사용자가 직접 조립할 수 있는가 (계획 기본값 4: 친구 도움 = 둘 다 가능 간주) */
export function canAssemble(answers: Answers): boolean {
  return answers.assembly === "self" || answers.assembly === "friend";
}

/** 조립 서비스를 쓸 사용자인가 */
export function usesAssemblyService(answers: Answers): boolean {
  return answers.assembly === "service";
}

export interface PrefHit {
  key: string;
  points: number;
}

/** 선호조건 가점 — 충족 목록과 합계 */
export function preferencePoints(
  p: Product,
  answers: Answers,
  cost: CostBreakdown
): PrefHit[] {
  const hits: PrefHit[] = [];
  const deliveryKnown = !p.unknown_fields?.some(
    (field) => field === "delivery_days_min" || field === "delivery_days_max"
  );

  if (answers.delivery !== "any" && deliveryKnown) {
    const limit = DELIVERY_BUCKET_DAYS[answers.delivery];
    if (p.delivery_days_max + 7 <= limit) {
      hits.push({ key: "delivery_margin", points: 2 });
    }
    if (
      p.scheduled_delivery &&
      !p.unknown_fields?.includes("scheduled_delivery")
    ) {
      hits.push({ key: "scheduled_delivery", points: 1 });
    }
  }
  if (
    answers.wantsMattress === true &&
    p.mattress_included &&
    !p.unknown_fields?.includes("mattress_included")
  ) {
    hits.push({ key: "mattress_included", points: 2 });
  }
  if (p.disassembly_ease === "easy") {
    hits.push({ key: "disassembly", points: 1 });
  }
  if (
    answers.budget !== null &&
    answers.priceBasis === "total" &&
    cost.unknownParts.length === 0 &&
    cost.knownTotal <= answers.budget * 0.8
  ) {
    hits.push({ key: "budget_margin", points: 1 });
  }

  return hits;
}

/**
 * 리스크별 감점. 사용자의 능력(Q2)에 따라 같은 리스크라도 감점이 줄어든다.
 * 예: 삐걱임은 직접 나사 보강이 가능한 사용자에게는 절반 수준.
 */
export function riskPenalty(
  risk: ReviewRisk,
  p: Product,
  answers: Answers
): number {
  const assemble = canAssemble(answers);
  const service = usesAssemblyService(answers);

  switch (risk) {
    case "squeak":
      return assemble ? 1 : 2;
    case "wobble":
      return assemble ? 1 : 2;
    case "smell":
      return 1;
    case "assembly_hard":
      return service ? 0 : assemble ? 1 : 3;
    case "manual_poor":
      return service ? 0 : 1;
    case "missing_parts":
      return service ? 1 : 2;
    case "delivery_delay":
      return answers.delivery === "any" ? 1 : 2;
    case "finish_poor":
      return 1;
    case "drawer_awkward":
      return answers.storage === "drawers" ? 2 : 1;
    case "extra_cost":
      return 1;
  }
}

export interface RiskHit {
  risk: ReviewRisk;
  penalty: number;
}

export function riskPenalties(p: Product, answers: Answers): RiskHit[] {
  return p.review_risks.map((risk) => ({
    risk,
    penalty: riskPenalty(risk, p, answers),
  }));
}

export interface ScoreResult {
  score: number;
  prefHits: PrefHit[];
  riskHits: RiskHit[];
  /** 확인할 위험 수 — 감점이 0으로 상쇄된 리스크는 제외 */
  riskCount: number;
}

export function scoreProduct(
  p: Product,
  answers: Answers,
  cost: CostBreakdown
): ScoreResult {
  const prefHits = preferencePoints(p, answers, cost);
  const riskHits = riskPenalties(p, answers);
  const prefTotal = prefHits.reduce((sum, h) => sum + h.points, 0);
  const riskTotal = riskHits.reduce((sum, h) => sum + h.penalty, 0);
  return {
    score: prefTotal - riskTotal,
    prefHits,
    riskHits,
    riskCount: riskHits.filter((h) => h.penalty > 0).length,
  };
}
