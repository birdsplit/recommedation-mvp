import type {
  Answers,
  ConditionCheck,
  ConditionStatus,
  CostBreakdown,
  DeliveryAnswer,
  Product,
} from "./types";
import {
  ASSEMBLY_ANSWER_LABELS,
  budgetLabel,
  CARRY_ANSWER_LABELS,
  DELIVERY_ANSWER_LABELS,
  STORAGE_ANSWER_LABELS,
} from "./answers";

/**
 * 선택 조건을 met / unknown / not_met으로 판정한다.
 * unknown은 불충족이 아니라, 현재 근거로 충족을 단정할 수 없다는 뜻이다.
 */

export const DELIVERY_BUCKET_DAYS: Record<
  Exclude<DeliveryAnswer, "any">,
  number
> = {
  this_week: 7,
  two_weeks: 14,
  one_month: 30,
};

function check(
  key: ConditionCheck["key"],
  label: string,
  status: ConditionStatus,
  options: Pick<ConditionCheck, "note" | "evidenceIds"> & {
    required?: boolean;
  } = {}
): ConditionCheck {
  return {
    key,
    label,
    status,
    required: options.required ?? true,
    ...(options.note ? { note: options.note } : {}),
    ...(options.evidenceIds ? { evidenceIds: options.evidenceIds } : {}),
  };
}

export function checkBudget(
  p: Product,
  answers: Answers,
  cost: CostBreakdown
): ConditionCheck {
  const label = budgetLabel(answers);
  if (answers.budget === null) {
    return check("budget", label, "unknown", {
      required: false,
      note: "예산을 선택하지 않아 추천 판정에서 제외했어요",
    });
  }

  const basisAmount =
    answers.priceBasis === "total" ? cost.knownTotal : p.price;
  if (basisAmount > answers.budget) {
    return check("budget", label, "not_met", {
      note: `확인된 금액만 ${basisAmount.toLocaleString("ko-KR")}원이에요`,
    });
  }
  if (
    answers.priceBasis === "total" &&
    cost.unknownParts.length > 0
  ) {
    return check("budget", label, "unknown", {
      note: `${cost.unknownParts.join("·")} 미확인 — 최종 총비용 확인 필요`,
    });
  }
  return check("budget", label, "met");
}

export function checkDelivery(p: Product, answers: Answers): ConditionCheck {
  const label = DELIVERY_ANSWER_LABELS[answers.delivery];
  if (answers.delivery === "any") {
    return check("delivery", label, "unknown", {
      required: false,
      note: "배송 기한을 선택하지 않아 추천 판정에서 제외했어요",
    });
  }
  if (
    p.unknown_fields?.includes("delivery_days_min") ||
    p.unknown_fields?.includes("delivery_days_max")
  ) {
    return check("delivery", label, "unknown", {
      note: "배송 예정 기간 확인 필요",
    });
  }
  const limit = DELIVERY_BUCKET_DAYS[answers.delivery];
  return check(
    "delivery",
    label,
    p.delivery_days_max <= limit ? "met" : "not_met",
    { note: `배송 ${p.delivery_days_min}~${p.delivery_days_max}일` }
  );
}

export function checkStorage(p: Product, answers: Answers): ConditionCheck {
  const label = STORAGE_ANSWER_LABELS[answers.storage];
  switch (answers.storage) {
    case "any":
      return check("storage", label, "unknown", {
        required: false,
        note: "수납 방식을 선택하지 않아 추천 판정에서 제외했어요",
      });
    case "big_items":
      return check(
        "storage",
        label,
        p.storage_type === "lift_up" ? "met" : "not_met"
      );
    case "drawers":
      return check(
        "storage",
        label,
        p.storage_type === "drawer" ? "met" : "not_met"
      );
    case "robot_vacuum": {
      if (p.robot_vacuum_fit === null) {
        return check("storage", label, "unknown", {
          note: "로봇청소기 통과 높이 확인 필요",
        });
      }
      if (p.robot_vacuum_fit === "ok") {
        return check("storage", label, "met");
      }
      if (p.robot_vacuum_fit === "check_height") {
        const height =
          p.under_bed_clearance_cm !== null
            ? `하부 ${p.under_bed_clearance_cm}cm`
            : "하부 높이";
        return check("storage", label, "unknown", {
          note: `${height} — 사용하는 기종 높이 확인 필요`,
        });
      }
      return check("storage", label, "not_met");
    }
    case "closed": {
      if (p.dust_blocking === "high") {
        return check("storage", label, "met");
      }
      if (p.dust_blocking === null) {
        return check("storage", label, "unknown", {
          note: "먼지 차단 정도 확인 필요",
        });
      }
      const closedStructure = ["closed_base", "lift_up", "drawer"].includes(
        p.storage_type
      );
      const status =
        closedStructure && p.dust_blocking !== "low" ? "met" : "not_met";
      return check("storage", label, status, {
        note:
          status === "met"
            ? "먼지 차단 보통 — 완전 밀폐는 아니에요"
            : undefined,
      });
    }
  }
}

export function checkCarry(p: Product, answers: Answers): ConditionCheck {
  const label = CARRY_ANSWER_LABELS[answers.carry];
  if (answers.carry === "service") {
    if (p.unknown_fields?.includes("carry_service_available")) {
      return check("carry", label, "unknown", {
        note: "집 안 운반 서비스 제공 여부 확인 필요",
      });
    }
    return check(
      "carry",
      label,
      p.carry_service_available ? "met" : "not_met",
      {
        note: p.carry_service_available
          ? "집 안 운반 서비스 제공"
          : "집 안 운반 서비스 없음",
      }
    );
  }
  if (p.carry_difficulty === null) {
    return check("carry", label, "unknown", {
      note: "포장 무게와 운반 난이도 확인 필요",
    });
  }
  if (answers.carry === "self" && p.carry_difficulty === "hard") {
    return check("carry", label, "not_met", {
      note: "혼자 옮기기 어려운 무게로 확인됐어요",
    });
  }
  return check("carry", label, "met", {
    note:
      p.carry_difficulty === "hard"
        ? "무거운 제품 — 포장 무게와 필요한 인원을 확인하세요"
        : undefined,
  });
}

export function checkAssembly(p: Product, answers: Answers): ConditionCheck {
  const label = ASSEMBLY_ANSWER_LABELS[answers.assembly];
  if (answers.assembly === "service") {
    if (p.unknown_fields?.includes("assembly_service_available")) {
      return check("assembly", label, "unknown", {
        note: "조립 서비스 제공 여부 확인 필요",
      });
    }
    return check(
      "assembly",
      label,
      p.assembly_service_available ? "met" : "not_met",
      {
        note: p.assembly_service_available
          ? "조립 서비스 제공"
          : "조립 서비스 없음",
      }
    );
  }
  if (p.self_assembly === null) {
    return check("assembly", label, "unknown", {
      note: "직접 조립 가능 여부 확인 필요",
    });
  }
  if (p.self_assembly === "not_possible") {
    return check("assembly", label, "not_met", {
      note: "기사 설치 전용 상품이에요",
    });
  }
  if (p.unknown_fields?.includes("assembly_people")) {
    return check("assembly", label, "unknown", {
      note: "권장 조립 인원 확인 필요",
    });
  }
  if (answers.assembly === "self") {
    if (p.self_assembly === "hard" || p.assembly_people > 1) {
      return check("assembly", label, "not_met", {
        note:
          p.assembly_people > 1
            ? `혼자 조립하기 어려워 권장 ${p.assembly_people}인이에요`
            : "혼자 조립하기 어려운 상품으로 확인됐어요",
      });
    }
    return check("assembly", label, "met");
  }
  if (p.assembly_people > 2) {
    return check("assembly", label, "not_met", {
      note: `친구 한 명과 조립하기 어려워 권장 ${p.assembly_people}인이에요`,
    });
  }
  return check("assembly", label, "met", {
    note:
      p.self_assembly === "hard"
        ? "조립 난이도가 높아 공구와 설명서를 미리 확인하세요"
        : undefined,
  });
}

/** 방 크기를 묻지 않았으므로 자동 충족시키지 않고 안내 항목으로만 둔다. */
export function checkSize(p: Product): ConditionCheck {
  const dims =
    p.width_cm !== null && p.length_cm !== null
      ? `${p.width_cm}×${p.length_cm}cm`
      : "상품 크기";
  return check("size", "방에 들어가는 크기", "unknown", {
    required: false,
    note: `${dims} — 설치 공간을 직접 실측해 주세요`,
  });
}

export function runChecks(
  p: Product,
  answers: Answers,
  cost: CostBreakdown
): ConditionCheck[] {
  const checks = [
    ...(answers.budget !== null ? [checkBudget(p, answers, cost)] : []),
    ...(answers.delivery !== "any" ? [checkDelivery(p, answers)] : []),
    ...(answers.storage !== "any" ? [checkStorage(p, answers)] : []),
    checkCarry(p, answers),
    checkAssembly(p, answers),
    checkSize(p),
  ].map((item) => {
    const groupsByKey: Record<ConditionCheck["key"], string[]> = {
      budget: ["commercial", "delivery"],
      delivery: ["delivery"],
      storage: ["spec"],
      carry: ["delivery", "spec"],
      assembly: ["delivery", "spec"],
      size: ["spec"],
    };
    const evidenceIds = (p.evidence ?? [])
      .filter((evidence) => groupsByKey[item.key].includes(evidence.field_group))
      .map((evidence) => String(evidence.id));
    return evidenceIds.length > 0 ? { ...item, evidenceIds } : item;
  });
  if (p.data_confidence !== "estimated") return checks;

  return checks.map((item) =>
    item.required && item.status !== "unknown"
      ? {
          ...item,
          status: "unknown",
          note: item.note
            ? `${item.note} · 일부 상품 정보는 추정값이에요`
            : "일부 상품 정보는 추정값이라 구매 전 확인이 필요해요",
        }
      : item
  );
}

export function requiredChecks(checks: ConditionCheck[]): ConditionCheck[] {
  return checks.filter((item) => item.required);
}

export function conditionStatus(checks: ConditionCheck[]): ConditionStatus {
  const required = requiredChecks(checks);
  if (required.some((item) => item.status === "not_met")) return "not_met";
  if (required.some((item) => item.status === "unknown")) return "unknown";
  return "met";
}

export function passesAll(checks: ConditionCheck[]): boolean {
  return conditionStatus(checks) === "met";
}

export function isEligible(checks: ConditionCheck[]): boolean {
  return conditionStatus(checks) !== "not_met";
}
