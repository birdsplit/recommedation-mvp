import type {
  Answers,
  ConditionCheck,
  CostBreakdown,
  DeliveryAnswer,
  Product,
} from "./types";
import {
  budgetLabel,
  CARRY_ANSWER_LABELS,
  DELIVERY_ANSWER_LABELS,
  STORAGE_ANSWER_LABELS,
} from "./answers";

/**
 * 필수조건 하드 필터 (기획서 §9.1).
 * 하나라도 불충족이면 후보에서 제외된다. 각 조건은 충족표(화면7)의 한 행이 된다.
 */

export const DELIVERY_BUCKET_DAYS: Record<
  Exclude<DeliveryAnswer, "any">,
  number
> = {
  this_week: 7,
  two_weeks: 14,
  one_month: 30,
};

export function checkBudget(
  p: Product,
  answers: Answers,
  cost: CostBreakdown
): ConditionCheck {
  const label = budgetLabel(answers);
  if (answers.budget === null) {
    return { key: "budget", label, pass: true };
  }
  const basisAmount =
    answers.priceBasis === "total" ? cost.knownTotal : p.price;
  const pass = basisAmount <= answers.budget;
  const note =
    pass && answers.priceBasis === "total" && cost.unknownParts.length > 0
      ? `${cost.unknownParts.join("·")} 별도 (판매처 확인)`
      : undefined;
  return { key: "budget", label, pass, note };
}

export function checkDelivery(p: Product, answers: Answers): ConditionCheck {
  const label = DELIVERY_ANSWER_LABELS[answers.delivery];
  if (answers.delivery === "any") {
    return { key: "delivery", label, pass: true };
  }
  const limit = DELIVERY_BUCKET_DAYS[answers.delivery];
  const pass = p.delivery_days_max <= limit;
  return {
    key: "delivery",
    label,
    pass,
    note: `배송 ${p.delivery_days_min}~${p.delivery_days_max}일`,
  };
}

export function checkStorage(p: Product, answers: Answers): ConditionCheck {
  const label = STORAGE_ANSWER_LABELS[answers.storage];
  switch (answers.storage) {
    case "any":
      return { key: "storage", label, pass: true };
    case "big_items":
      return { key: "storage", label, pass: p.storage_type === "lift_up" };
    case "drawers":
      return { key: "storage", label, pass: p.storage_type === "drawer" };
    case "robot_vacuum": {
      // 'check_height'는 통과시키되 주의를 만든다 (reasons.ts)
      const pass =
        p.robot_vacuum_fit === "ok" || p.robot_vacuum_fit === "check_height";
      const note =
        p.robot_vacuum_fit === "check_height" &&
        p.under_bed_clearance_cm !== null
          ? `하부 ${p.under_bed_clearance_cm}cm — 기종 확인 필요`
          : undefined;
      return { key: "storage", label, pass, note };
    }
    case "closed": {
      const closedStructure = ["closed_base", "lift_up", "drawer"].includes(
        p.storage_type
      );
      // 완전 차단(high)이거나, 막힌 구조이면서 차단력이 낮지 않은 경우만
      const pass =
        p.dust_blocking === "high" ||
        (closedStructure && p.dust_blocking !== "low");
      const note =
        pass && p.dust_blocking !== "high"
          ? "먼지 차단 보통 — 완전 밀폐는 아니에요"
          : undefined;
      return { key: "storage", label, pass, note };
    }
  }
}

export function checkCarry(p: Product, answers: Answers): ConditionCheck {
  const label = CARRY_ANSWER_LABELS[answers.carry];
  switch (answers.carry) {
    case "both_ok":
    case "friend_help":
      return { key: "carry", label, pass: true };
    case "assembly_only": {
      // 운반이 어려움 → 집 안까지 운반 서비스가 있거나, 혼자 옮길 만큼 가벼워야 함.
      // 서비스 없이 통과할 때는 그 가정을 반드시 고지한다 (note + reasons.ts 주의)
      if (p.carry_service_available) {
        return { key: "carry", label, pass: true, note: "운반 서비스 제공" };
      }
      if (p.carry_difficulty === "easy") {
        return {
          key: "carry",
          label,
          pass: true,
          note: "운반 서비스 없음 — 가벼워서 혼자 옮기는 기준",
        };
      }
      return { key: "carry", label, pass: false };
    }
    case "carry_only": {
      // 조립이 어려움 → 조립 서비스가 있거나, 혼자 조립이 아주 쉬워야 함
      if (p.assembly_service_available) {
        return { key: "carry", label, pass: true, note: "조립 서비스 제공" };
      }
      if (p.self_assembly === "easy") {
        return {
          key: "carry",
          label,
          pass: true,
          note: "조립 서비스 없음 — 조립이 아주 쉬운 제품 기준",
        };
      }
      return { key: "carry", label, pass: false };
    }
    case "need_both": {
      const pass = p.carry_service_available && p.assembly_service_available;
      return { key: "carry", label, pass };
    }
  }
}

/** 크기 — MVP는 전 상품 슈퍼싱글이라 자동 통과, 실측 확인만 권장 (계획 기본값 5) */
export function checkSize(p: Product): ConditionCheck {
  const dims =
    p.width_cm && p.length_cm
      ? `${p.width_cm}×${p.length_cm}cm`
      : "슈퍼싱글 규격";
  return {
    key: "size",
    label: "방에 들어가는 크기",
    pass: true,
    note: `${dims} — 방 실측 확인 권장`,
  };
}

export function runChecks(
  p: Product,
  answers: Answers,
  cost: CostBreakdown
): ConditionCheck[] {
  return [
    checkBudget(p, answers, cost),
    checkDelivery(p, answers),
    checkStorage(p, answers),
    checkCarry(p, answers),
    checkSize(p),
  ];
}

export function passesAll(checks: ConditionCheck[]): boolean {
  return checks.every((c) => c.pass);
}
