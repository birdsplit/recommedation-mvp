import type { ReactNode } from "react";
import type { Capacity, Dust, Level3, Product, Recommendation } from "@/lib/reco/types";
import { formatWon } from "@/lib/reco/cost";
import { REVIEW_RISKS, ROBOT_FIT_LABELS } from "@/lib/constants";

/**
 * 화면8 비교표의 행 정의 (기획서 비교 항목 11개, 순서 고정).
 * diffKey — 행 안에서 상품 간 값이 다른지 판단하는 비교용 문자열.
 */

const NONE = "－";

const CAPACITY_LABELS: Record<Capacity, string> = {
  large: "대형",
  medium: "중형",
  small: "소형",
  none: "없음",
};

const DUST_LABELS: Record<Dust, string> = {
  high: "좋음",
  medium: "보통",
  low: "낮음",
};

const LEVEL3_LABELS: Record<Level3, string> = {
  easy: "쉬움",
  medium: "보통",
  hard: "어려움",
};

/** 운반 — carry_service_available과 carry_difficulty 조합 */
function carryValue(p: Product): string {
  if (p.carry_service_available) return "운반 서비스 있음";
  if (p.carry_difficulty === "easy") return "가벼움 (혼자 가능)";
  if (p.carry_difficulty !== null) return "직접 운반 (무거움)";
  return NONE;
}

/** 조립 — self_assembly + 필요 인원 */
function assemblyValue(p: Product): string {
  if (p.self_assembly === null) return NONE;
  if (p.self_assembly === "not_possible") return "기사 설치";
  return `${LEVEL3_LABELS[p.self_assembly]} (${p.assembly_people}인)`;
}

function riskValue(p: Product): string {
  if (p.review_risks.length === 0) return NONE;
  return p.review_risks
    .slice(0, 2)
    .map((r) => REVIEW_RISKS[r])
    .join(" · ");
}

export interface CompareRow {
  label: string;
  value: (rec: Recommendation) => ReactNode;
  diffKey: (rec: Recommendation) => string;
}

export const COMPARE_ROWS: CompareRow[] = [
  {
    label: "총비용",
    value: (rec) => (
      <span className="font-extrabold text-coral-700">
        {formatWon(rec.cost.knownTotal)}
        {rec.cost.unknownParts.length > 0 && (
          <sup className="ml-0.5 text-[9px] font-bold text-honey-700">
            +별도
          </sup>
        )}
      </span>
    ),
    diffKey: (rec) =>
      `${rec.cost.knownTotal}|${rec.cost.unknownParts.length > 0}`,
  },
  {
    label: "배송일",
    value: (rec) =>
      `${rec.product.delivery_days_min}~${rec.product.delivery_days_max}일`,
    diffKey: (rec) =>
      `${rec.product.delivery_days_min}~${rec.product.delivery_days_max}`,
  },
  {
    label: "수납력",
    value: (rec) =>
      rec.product.storage_capacity === null
        ? NONE
        : CAPACITY_LABELS[rec.product.storage_capacity],
    diffKey: (rec) => rec.product.storage_capacity ?? NONE,
  },
  {
    label: "먼지 차단",
    value: (rec) =>
      rec.product.dust_blocking === null
        ? NONE
        : DUST_LABELS[rec.product.dust_blocking],
    diffKey: (rec) => rec.product.dust_blocking ?? NONE,
  },
  {
    label: "로봇청소기",
    value: (rec) =>
      rec.product.robot_vacuum_fit === null
        ? NONE
        : ROBOT_FIT_LABELS[rec.product.robot_vacuum_fit],
    diffKey: (rec) => rec.product.robot_vacuum_fit ?? NONE,
  },
  {
    label: "운반",
    value: (rec) => carryValue(rec.product),
    diffKey: (rec) => carryValue(rec.product),
  },
  {
    label: "조립",
    value: (rec) => assemblyValue(rec.product),
    diffKey: (rec) => assemblyValue(rec.product),
  },
  {
    label: "매트리스 포함",
    value: (rec) => (rec.product.mattress_included ? "포함" : "미포함"),
    diffKey: (rec) => String(rec.product.mattress_included),
  },
  {
    label: "주요 리뷰 리스크",
    value: (rec) => riskValue(rec.product),
    diffKey: (rec) => riskValue(rec.product),
  },
  {
    label: "이사·분해",
    value: (rec) =>
      rec.product.disassembly_ease === null
        ? NONE
        : LEVEL3_LABELS[rec.product.disassembly_ease],
    diffKey: (rec) => rec.product.disassembly_ease ?? NONE,
  },
  {
    label: "최종 판단",
    value: (rec) => (
      <span className="text-[11px] font-medium leading-snug text-sub">
        {rec.finalJudgment}
      </span>
    ),
    diffKey: (rec) => rec.finalJudgment,
  },
];
