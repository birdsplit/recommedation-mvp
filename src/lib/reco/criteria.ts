import { REASON_CHIPS, REVIEW_RISKS } from "@/lib/constants";
import type { ReasonChip, ReviewRisk } from "@/lib/constants";
import type {
  Answers,
  ConditionStatus,
  CostBreakdown,
  Product,
  Recommendation,
} from "./types";
import { computeCost } from "./cost";
import { riskPenalty, type PrefHit } from "./score";

/**
 * 반응 기반 추천(arm B)의 기준 모델 (기획 개정 §4~§6).
 *
 * 흐름: 후보 카드에 반응(저장/제외/보류)하며 이유 칩을 누적 → 칩이 임계치를 넘으면
 * 확인 카드(예: "하부 청소가 편한 침대가 중요하신가요?")를 띄운다 → 사용자가
 * 필수/선호/아니요로 답하면 기준이 필수(must)·선호(prefer)·감당 가능한 단점(tolerated)으로
 * 분류된다 → 후보가 재정렬된다.
 *
 * 설계 원칙:
 * - 날조 금지: 상품 필드가 null/미확인이면 기준 판정은 "met"이 아니라 "unknown"이다.
 * - 결정성: Date.now()/Math.random() 없이 같은 입력 → 같은 출력·순서.
 * - arm A 불변: 이 모듈은 순수 함수만 제공하고 기존 엔진 동작을 바꾸지 않는다.
 */

// ---------- 기준 키와 세션 상태 ----------

/** 반응에서 도출 가능한(또는 기준판에서 토글하는) 기준 키 */
export type CriterionKey =
  | "storage_big"
  | "storage_drawer"
  | "under_bed_clean"
  | "dust_block"
  | "low_total_cost"
  | "easy_assembly"
  | "fast_delivery"
  | "mattress_included"
  | "low_review_risk";

/** 기준이 담기는 세 분류 */
export type Bucket = "must" | "prefer" | "tolerated";

/** 선호 기준 — 가점 무게와 어느 반응 칩에서 왔는지(origin)를 기억한다 */
export interface PreferCriterion {
  key: CriterionKey;
  weight: number;
  origin: ReasonChip;
}

/**
 * 한 세션에서 확정된 기준.
 * must: 필수 조건(불충족 후보는 비추천), prefer: 가점, tolerated: 감당 가능한 리뷰 리스크(감점 면제).
 */
export interface SessionCriteria {
  must: CriterionKey[];
  prefer: PreferCriterion[];
  tolerated: ReviewRisk[];
}

export const EMPTY_CRITERIA: SessionCriteria = {
  must: [],
  prefer: [],
  tolerated: [],
};

/** 선호 가점 기본 무게 및 상한 (URL 조작 방어용 클램프) */
export const DEFAULT_PREFER_WEIGHT = 2;
const MAX_PREFER_WEIGHT = 9;

/** 백분위 기준선 — 총비용이 후보 풀의 하위 25% 이내면 "저렴" */
export const LOW_COST_POOL_PERCENTILE = 0.25;

/** 이 일수 이내 도착이면 "빠른 배송" */
export const FAST_DELIVERY_DAYS = 14;

// ---------- 반응 로그 ----------

export type ReactionKind = "save" | "exclude" | "hold";

export interface Reaction {
  productId: string;
  kind: ReactionKind;
  chips: ReasonChip[];
}

export type ReactionLog = Reaction[];

// ---------- 반응 → 기준 변환 규칙 ----------

/** 확인 카드 한 장의 정의 — 어떤 칩이 어떤 기준·질문으로 이어지는지 */
export interface CriterionSuggestion {
  /** 답변 기록(answeredIds)과 대조하는 안정적 id — 칩 slug와 1:1 */
  id: string;
  chip: ReasonChip;
  /** 기준으로 변환되는 대상 키. null이면 취향 칩이라 기준화하지 않는다. */
  targetKey: CriterionKey | null;
  question: string;
  threshold: number;
  defaultWeight: number;
}

/**
 * 결정적 변환 표 (임계치는 별도 표기 없으면 2).
 * 이 배열의 순서가 곧 확인 카드 노출 우선순위다 — deriveSuggestions가 그대로 따른다.
 * design_dislike / like_design은 취향이라 targetKey가 null이며 확인 카드를 만들지 않는다
 * (근거 없는 기준을 지어내지 않는다는 날조 금지 원칙).
 */
export const REACTION_RULES: readonly CriterionSuggestion[] = [
  {
    id: "cleaning_worry",
    chip: "cleaning_worry",
    targetKey: "under_bed_clean",
    question: "하부 청소가 편한 침대가 중요하신가요?",
    threshold: 2,
    defaultWeight: DEFAULT_PREFER_WEIGHT,
  },
  {
    id: "storage_lack",
    chip: "storage_lack",
    targetKey: "storage_big",
    question: "수납 공간이 넉넉한 게 중요하신가요?",
    threshold: 2,
    defaultWeight: DEFAULT_PREFER_WEIGHT,
  },
  {
    id: "price_burden",
    chip: "price_burden",
    targetKey: "low_total_cost",
    question: "총비용을 더 낮추고 싶으세요?",
    threshold: 2,
    defaultWeight: DEFAULT_PREFER_WEIGHT,
  },
  {
    id: "assembly_worry",
    chip: "assembly_worry",
    targetKey: "easy_assembly",
    question: "조립이 쉬운 침대가 중요하신가요?",
    threshold: 2,
    defaultWeight: DEFAULT_PREFER_WEIGHT,
  },
  {
    id: "delivery_late",
    chip: "delivery_late",
    targetKey: "fast_delivery",
    question: "빨리 받는 게 중요하신가요?",
    threshold: 2,
    defaultWeight: DEFAULT_PREFER_WEIGHT,
  },
  {
    id: "review_anxiety",
    chip: "review_anxiety",
    targetKey: "low_review_risk",
    question: "리뷰 위험이 적은 후보를 원하세요?",
    threshold: 2,
    defaultWeight: DEFAULT_PREFER_WEIGHT,
  },
  {
    id: "like_storage",
    chip: "like_storage",
    targetKey: "storage_big",
    question: "수납형을 우선 볼까요?",
    threshold: 2,
    defaultWeight: DEFAULT_PREFER_WEIGHT,
  },
  {
    id: "like_clean",
    chip: "like_clean",
    targetKey: "under_bed_clean",
    question: "하부 청소 편의를 우선할까요?",
    threshold: 2,
    defaultWeight: DEFAULT_PREFER_WEIGHT,
  },
  {
    id: "like_price",
    chip: "like_price",
    targetKey: "low_total_cost",
    question: "총비용이 낮은 순으로 볼까요?",
    threshold: 2,
    defaultWeight: DEFAULT_PREFER_WEIGHT,
  },
  {
    id: "design_dislike",
    chip: "design_dislike",
    targetKey: null,
    question: "",
    threshold: 2,
    defaultWeight: DEFAULT_PREFER_WEIGHT,
  },
  {
    id: "like_design",
    chip: "like_design",
    targetKey: null,
    question: "",
    threshold: 2,
    defaultWeight: DEFAULT_PREFER_WEIGHT,
  },
];

// ---------- 안전한 화이트리스트 조회 (answers.ts lookup 패턴) ----------

const CRITERION_KEYS: readonly CriterionKey[] = [
  "storage_big",
  "storage_drawer",
  "under_bed_clean",
  "dust_block",
  "low_total_cost",
  "easy_assembly",
  "fast_delivery",
  "mattress_included",
  "low_review_risk",
];

const CRITERION_KEY_SET: Record<string, true> = Object.fromEntries(
  CRITERION_KEYS.map((key) => [key, true])
);

/**
 * 사용자 제어 문자열(URL·API 본문)에서 상속 키(__proto__, constructor 등)가
 * 통과하지 않도록 own property만 확인한다.
 */
function isCriterionKey(value: string): value is CriterionKey {
  return Object.prototype.hasOwnProperty.call(CRITERION_KEY_SET, value);
}

function isReasonChip(value: string): value is ReasonChip {
  return Object.prototype.hasOwnProperty.call(REASON_CHIPS, value);
}

function isReviewRisk(value: string): value is ReviewRisk {
  return Object.prototype.hasOwnProperty.call(REVIEW_RISKS, value);
}

// ---------- 칩 집계와 확인 카드 도출 ----------

/** 로그의 모든 반응에 붙은 칩을 slug별로 센다. 모든 칩 키를 0으로 초기화해 완전한 레코드를 돌려준다. */
export function countChips(log: ReactionLog): Record<ReasonChip, number> {
  const counts = Object.fromEntries(
    (Object.keys(REASON_CHIPS) as ReasonChip[]).map((chip) => [chip, 0])
  ) as Record<ReasonChip, number>;
  for (const reaction of log) {
    for (const chip of reaction.chips) {
      if (Object.prototype.hasOwnProperty.call(counts, chip)) {
        counts[chip] += 1;
      }
    }
  }
  return counts;
}

/**
 * 지금 띄울 확인 카드 후보를 규칙 표 순서로 돌려준다.
 * 조건: 칩 누적이 임계치 이상 · targetKey가 있음 · 이미 must/prefer에 있지 않음 ·
 *       같은 targetKey를 아직 제안하지 않음(중복 제거) · id가 answeredIds에 없음.
 *
 * answeredIds는 사용자가 "아니요"로 답한(또는 이미 처리한) 카드 id다. 부정 칩 카드를
 * 거절해도 같은 기준을 노리는 긍정 칩 카드는 아직 뜰 수 있게, 거절된 규칙은
 * targetKey를 "제안됨"으로 표시하지 않는다.
 */
export function deriveSuggestions(
  log: ReactionLog,
  criteria: SessionCriteria,
  answeredIds: readonly string[]
): CriterionSuggestion[] {
  const counts = countChips(log);
  const answered = new Set(answeredIds);
  const settled = new Set<CriterionKey>([
    ...criteria.must,
    ...criteria.prefer.map((pref) => pref.key),
  ]);
  const suggestions: CriterionSuggestion[] = [];
  for (const rule of REACTION_RULES) {
    if (rule.targetKey === null) continue;
    if (settled.has(rule.targetKey)) continue;
    if (answered.has(rule.id)) continue;
    if (counts[rule.chip] < rule.threshold) continue;
    suggestions.push(rule);
    settled.add(rule.targetKey); // 같은 기준을 두 카드로 두 번 묻지 않는다
  }
  return suggestions;
}

// ---------- 확인 응답 적용 (불변) ----------

/**
 * 확인 카드 응답을 기준에 반영한다. 입력을 변형하지 않고 새 객체를 돌려준다.
 * - "must": 필수 목록에 추가하고 선호 목록에서 같은 키를 제거한다(필수가 선호를 덮어씀).
 * - "prefer": 아직 없으면 {key, weight, origin}을 선호에 추가한다.
 * - "no": 그대로 반환한다(호출부가 answeredIds에 기록해 다시 뜨지 않게 한다).
 * targetKey가 null인 취향 칩은 언제나 그대로 반환한다.
 */
export function applyConfirmation(
  criteria: SessionCriteria,
  suggestion: CriterionSuggestion,
  answer: "must" | "prefer" | "no"
): SessionCriteria {
  if (suggestion.targetKey === null || answer === "no") {
    return criteria;
  }
  const key = suggestion.targetKey;

  if (answer === "must") {
    return {
      must: criteria.must.includes(key)
        ? [...criteria.must]
        : [...criteria.must, key],
      prefer: criteria.prefer.filter((pref) => pref.key !== key),
      tolerated: [...criteria.tolerated],
    };
  }

  // answer === "prefer" — 필수·선호 어디에도 없을 때만 추가
  const alreadyTracked =
    criteria.must.includes(key) ||
    criteria.prefer.some((pref) => pref.key === key);
  if (alreadyTracked) {
    return criteria;
  }
  return {
    must: [...criteria.must],
    prefer: [
      ...criteria.prefer,
      { key, weight: suggestion.defaultWeight, origin: suggestion.chip },
    ],
    tolerated: [...criteria.tolerated],
  };
}

/**
 * 리뷰 리스크를 "감당 가능한 단점"으로 표시한다(불변).
 * 사용자가 그 리스크를 기준으로는 거절했지만 해당 리스크를 지닌 상품을 계속 저장할 때,
 * 또는 기준판에서 직접 토글할 때 쓴다.
 */
export function tolerateRisk(
  criteria: SessionCriteria,
  risk: ReviewRisk
): SessionCriteria {
  if (criteria.tolerated.includes(risk)) {
    return criteria;
  }
  return {
    must: [...criteria.must],
    prefer: criteria.prefer.map((pref) => ({ ...pref })),
    tolerated: [...criteria.tolerated, risk],
  };
}

// ---------- 기준 판정 (실제 상품 필드 기반 tri-state) ----------

/** criterionStatus / criterionPreferHit에 전달하는 맥락 */
export interface CriterionContext {
  /** low_total_cost 백분위 계산용 현재 후보 풀의 knownTotal 목록 */
  pool?: readonly { knownTotal: number }[];
  /** 감당 가능한 단점으로 표시된 리스크 (low_review_risk 판정에서 면제) */
  tolerated?: readonly ReviewRisk[];
  /** low_total_cost 판정에 재사용할 사전 계산된 총비용 (없으면 내부에서 계산) */
  cost?: CostBreakdown;
}

/**
 * 오름차순 정렬 후 floor 인덱스로 백분위 값을 뽑는다 — 결정적.
 * p=0 → 최솟값, p=1 → 최댓값. 동점은 정렬로 자연 처리된다.
 */
function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor(p * (sorted.length - 1));
  return sorted[index];
}

/**
 * 기준 하나를 상품에 대해 met/unknown/not_met으로 판정한다.
 * 핵심 원칙: 근거가 되는 필드가 null/미확인이면 "met"으로 단정하지 않고 "unknown"을 돌려준다.
 */
export function criterionStatus(
  key: CriterionKey,
  p: Product,
  answers: Answers,
  ctx?: CriterionContext
): ConditionStatus {
  switch (key) {
    case "storage_big": {
      // 용량을 모르면 넉넉함을 단정할 수 없다 → unknown
      if (p.storage_capacity === null) return "unknown";
      const structural =
        p.storage_type === "lift_up" || p.storage_type === "drawer";
      const roomy =
        p.storage_capacity === "large" || p.storage_capacity === "medium";
      return structural && roomy ? "met" : "not_met";
    }

    case "storage_drawer":
      // storage_type은 필수 enum이라 null이 없다 → unknown 케이스 없음
      return p.storage_type === "drawer" ? "met" : "not_met";

    case "under_bed_clean": {
      // 하부가 트여 있거나 로봇청소기가 확실히 들어가면 청소가 쉽다
      if (p.robot_vacuum_fit === "ok" || p.storage_type === "legs_open") {
        return "met";
      }
      // 로봇 적합성도 청소 난이도도 모르면 판단 근거가 없다
      if (p.robot_vacuum_fit === null && p.cleaning_ease === null) {
        return "unknown";
      }
      // cleaning_ease로 보수적으로 판정
      if (p.cleaning_ease === "easy") return "met";
      if (p.cleaning_ease === "hard") return "not_met";
      // robot_vacuum_fit이 check_height/no이고 cleaning_ease가 medium인 애매한 경우:
      // "편하다"고 단정할 수도, "불가"라고 못박을 수도 없어 unknown으로 남긴다(날조 금지).
      return "unknown";
    }

    case "dust_block":
      if (p.dust_blocking === null) return "unknown";
      return p.dust_blocking === "high" ? "met" : "not_met";

    case "low_total_cost": {
      const cost = ctx?.cost ?? computeCost(p, answers);
      // 총비용에 미확인 항목이 있으면 비교 자체가 불완전 → unknown
      if (cost.unknownParts.length > 0) return "unknown";
      const pool = ctx?.pool;
      // 비교할 후보 풀이 없으면 저렴 여부를 판단할 수 없다
      if (!pool || pool.length === 0) return "unknown";
      const threshold = percentile(
        pool.map((item) => item.knownTotal),
        LOW_COST_POOL_PERCENTILE
      );
      return cost.knownTotal <= threshold ? "met" : "not_met";
    }

    case "easy_assembly": {
      if (p.self_assembly === "easy" && p.assembly_people <= 1) return "met";
      // 조립 서비스가 확정으로 제공되면 조립 부담이 없다(서비스 탈출구)
      if (
        p.assembly_service_available &&
        !p.unknown_fields?.includes("assembly_service_available")
      ) {
        return "met";
      }
      if (p.self_assembly === null) return "unknown";
      return "not_met";
    }

    case "fast_delivery": {
      if (
        p.unknown_fields?.includes("delivery_days_min") ||
        p.unknown_fields?.includes("delivery_days_max")
      ) {
        return "unknown";
      }
      return p.delivery_days_max <= FAST_DELIVERY_DAYS ? "met" : "not_met";
    }

    case "mattress_included": {
      if (p.unknown_fields?.includes("mattress_included")) return "unknown";
      return p.mattress_included ? "met" : "not_met";
    }

    case "low_review_risk": {
      // 리뷰 표본이 없으면 리스크 유무를 판정할 근거가 없다
      if (
        p.review_sample_count === undefined ||
        p.review_sample_count === 0
      ) {
        return "unknown";
      }
      const severe = p.review_risks.some(
        (risk) => riskPenalty(risk, p, answers, ctx?.tolerated) >= 2
      );
      return severe ? "not_met" : "met";
    }
  }
}

/**
 * 선호 기준 가점. 충족(met)이면 {key: `criteria_${key}`, points: weight}, 아니면 null.
 * (unknown/not_met은 가점하지 않는다 — 근거 있는 met에만 가점.)
 */
export function criterionPreferHit(
  criterion: PreferCriterion,
  p: Product,
  answers: Answers,
  cost: CostBreakdown,
  ctx?: CriterionContext
): PrefHit | null {
  const status = criterionStatus(criterion.key, p, answers, { ...ctx, cost });
  if (status !== "met") return null;
  return { key: `criteria_${criterion.key}`, points: criterion.weight };
}

/** 기준판·설명에서 쓰는 한국어 라벨 */
export const CRITERION_LABELS: Record<CriterionKey, string> = {
  storage_big: "넉넉한 수납",
  storage_drawer: "서랍 수납",
  under_bed_clean: "하부 청소 편의",
  dust_block: "하부 먼지 차단",
  low_total_cost: "낮은 총비용",
  easy_assembly: "쉬운 조립",
  fast_delivery: "빠른 배송",
  mattress_included: "매트리스 포함",
  low_review_risk: "낮은 리뷰 위험",
};

// ---------- URL 코덱 (쿼리 파라미터 c) ----------

/** rule 표에서 targetKey를 노리는 첫 규칙의 칩을 origin 폴백으로 쓴다 */
function fallbackOrigin(key: CriterionKey): ReasonChip | null {
  const rule = REACTION_RULES.find((item) => item.targetKey === key);
  return rule ? rule.chip : null;
}

function parseWeight(raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_PREFER_WEIGHT) {
    return DEFAULT_PREFER_WEIGHT;
  }
  return value;
}

/**
 * 기준을 URL 파라미터 c용 컴팩트 문자열로 인코딩한다.
 * 형식: "m:storage_big,under_bed_clean;p:low_total_cost.2.like_price;t:squeak"
 * (선호는 key.weight.origin으로 origin까지 실어 왕복이 안정적이다.)
 */
export function encodeCriteria(criteria: SessionCriteria): string {
  const parts: string[] = [];
  if (criteria.must.length > 0) {
    parts.push(`m:${criteria.must.join(",")}`);
  }
  if (criteria.prefer.length > 0) {
    parts.push(
      `p:${criteria.prefer
        .map((pref) => `${pref.key}.${pref.weight}.${pref.origin}`)
        .join(",")}`
    );
  }
  if (criteria.tolerated.length > 0) {
    parts.push(`t:${criteria.tolerated.join(",")}`);
  }
  return parts.join(";");
}

/**
 * URL 파라미터 c를 기준으로 디코딩한다.
 * 모든 토큰을 알려진 키(own property)로 검증하고 유효하지 않은 토큰은 조용히 버린다.
 * origin이 생략/무효면 rule 표에서 폴백을 찾고, 그래도 없으면 그 선호 항목만 버린다.
 * 값이 없거나 전부 무효면 EMPTY_CRITERIA 형태의 새 객체를 돌려준다.
 */
export function decodeCriteria(raw: string | undefined): SessionCriteria {
  const must: CriterionKey[] = [];
  const prefer: PreferCriterion[] = [];
  const tolerated: ReviewRisk[] = [];
  if (!raw) {
    return { must, prefer, tolerated };
  }

  const seenMust = new Set<CriterionKey>();
  const seenPrefer = new Set<CriterionKey>();
  const seenTolerated = new Set<ReviewRisk>();

  for (const section of raw.split(";")) {
    const sep = section.indexOf(":");
    if (sep < 0) continue;
    const tag = section.slice(0, sep);
    const body = section.slice(sep + 1);
    if (body === "") continue;
    const tokens = body.split(",");

    if (tag === "m") {
      for (const token of tokens) {
        if (isCriterionKey(token) && !seenMust.has(token)) {
          seenMust.add(token);
          must.push(token);
        }
      }
    } else if (tag === "p") {
      for (const token of tokens) {
        const firstDot = token.indexOf(".");
        if (firstDot < 0) continue;
        const key = token.slice(0, firstDot);
        const rest = token.slice(firstDot + 1);
        const secondDot = rest.indexOf(".");
        const weightRaw = secondDot < 0 ? rest : rest.slice(0, secondDot);
        const originRaw = secondDot < 0 ? "" : rest.slice(secondDot + 1);
        if (!isCriterionKey(key) || seenPrefer.has(key)) continue;
        const origin = isReasonChip(originRaw)
          ? originRaw
          : fallbackOrigin(key);
        if (origin === null) continue;
        seenPrefer.add(key);
        prefer.push({ key, weight: parseWeight(weightRaw), origin });
      }
    } else if (tag === "t") {
      for (const token of tokens) {
        if (isReviewRisk(token) && !seenTolerated.has(token)) {
          seenTolerated.add(token);
          tolerated.push(token);
        }
      }
    }
  }

  // 필수로 승격된 키는 선호에서 제외(필수 우선) — 왕복 안정성 유지
  const preferFiltered = prefer.filter((pref) => !seenMust.has(pref.key));
  return { must, prefer: preferFiltered, tolerated };
}

/**
 * API 본문·DB jsonb에서 읽은 값이 안전한 SessionCriteria인지 엄격 검증한다.
 * 키 화이트리스트, 항목 형태, 중복 없음, 배열 상한(must ≤ 9, prefer ≤ 9, tolerated ≤ 10),
 * must·prefer 키 비중복까지 확인한다. 하나라도 어긋나면 false.
 */
export function isSessionCriteria(value: unknown): value is SessionCriteria {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const { must, prefer, tolerated } = candidate;
  if (!Array.isArray(must) || !Array.isArray(prefer) || !Array.isArray(tolerated)) {
    return false;
  }
  if (must.length > 9 || prefer.length > 9 || tolerated.length > 10) {
    return false;
  }

  const mustSeen = new Set<string>();
  for (const item of must) {
    if (typeof item !== "string" || !isCriterionKey(item) || mustSeen.has(item)) {
      return false;
    }
    mustSeen.add(item);
  }

  const preferSeen = new Set<string>();
  for (const item of prefer) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const entry = item as Record<string, unknown>;
    if (typeof entry.key !== "string" || !isCriterionKey(entry.key)) return false;
    if (
      typeof entry.weight !== "number" ||
      !Number.isInteger(entry.weight) ||
      entry.weight < 1 ||
      entry.weight > MAX_PREFER_WEIGHT
    ) {
      return false;
    }
    if (typeof entry.origin !== "string" || !isReasonChip(entry.origin)) {
      return false;
    }
    if (preferSeen.has(entry.key) || mustSeen.has(entry.key)) return false;
    preferSeen.add(entry.key);
  }

  const toleratedSeen = new Set<string>();
  for (const item of tolerated) {
    if (typeof item !== "string" || !isReviewRisk(item) || toleratedSeen.has(item)) {
      return false;
    }
    toleratedSeen.add(item);
  }

  return true;
}

// ---------- 엔진과 공유하는 반응 루프 타입 ----------

/** 필수 기준 하나의 판정 행 (공유 ConditionCheck 유니온을 넓히지 않으려 별도 타입) */
export interface CriteriaCheck {
  key: CriterionKey;
  label: string;
  status: ConditionStatus;
  origin: ReasonChip | null;
}

/** 반응 루프용 추천 — 기존 Recommendation에 기준 판정을 덧붙인다 */
export interface LoopRecommendation extends Recommendation {
  criteriaChecks: CriteriaCheck[];
}

/** 재정렬 전후 순위 변화 (순위는 1부터) */
export interface RankChange {
  id: string;
  name: string;
  prevRank: number | null;
  nextRank: number | null;
  /** 양수 = 상승한 계단 수 (prevRank - nextRank). 신규/이탈 항목은 0. */
  delta: number;
  tierChanged: boolean;
}
