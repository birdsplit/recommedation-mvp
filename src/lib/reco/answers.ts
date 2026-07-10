import type {
  Answers,
  Budget,
  CarryAnswer,
  DeliveryAnswer,
  PriceBasis,
  StorageAnswer,
} from "./types";

/**
 * 답변 ↔ URL 쿼리 인코딩.
 * 답변을 URL에 실어 /results가 새로고침·공유 가능하고, 조건 수정은
 * 쿼리를 유지한 채 /q/[step]으로 돌아가는 링크로 처리한다.
 * 쿼리 키: s(수납) c(운반·조립) b(예산) pb(가격기준) d(배송) m(매트리스)
 */

const STORAGE_CODES: Record<string, StorageAnswer> = {
  big: "big_items",
  drawer: "drawers",
  robot: "robot_vacuum",
  closed: "closed",
  any: "any",
};

const CARRY_CODES: Record<string, CarryAnswer> = {
  both: "both_ok",
  asm: "assembly_only",
  carry: "carry_only",
  svc: "need_both",
  friend: "friend_help",
};

const DELIVERY_CODES: Record<string, DeliveryAnswer> = {
  "1w": "this_week",
  "2w": "two_weeks",
  "1m": "one_month",
  any: "any",
};

function codeOf<T extends string>(map: Record<string, T>, value: T): string {
  return Object.entries(map).find(([, v]) => v === value)![0];
}

/**
 * 안전한 코드 조회 — 사용자 제어 쿼리이므로 프로토타입 상속 키
 * (?s=toString, ?c=constructor 등)가 통과하지 않도록 own property만 본다.
 */
function lookup<T extends string>(
  map: Record<string, T>,
  key: string | undefined
): T | undefined {
  return key !== undefined && Object.prototype.hasOwnProperty.call(map, key)
    ? map[key]
    : undefined;
}

export const DEFAULT_ANSWERS: Answers = {
  storage: "any",
  carry: "both_ok",
  budget: null,
  priceBasis: "total",
  delivery: "any",
  wantsMattress: null,
};

export function encodeAnswers(a: Answers): URLSearchParams {
  const q = new URLSearchParams();
  q.set("s", codeOf(STORAGE_CODES, a.storage));
  q.set("c", codeOf(CARRY_CODES, a.carry));
  if (a.budget !== null) q.set("b", String(a.budget));
  q.set("pb", a.priceBasis === "product_only" ? "item" : "total");
  q.set("d", codeOf(DELIVERY_CODES, a.delivery));
  if (a.wantsMattress !== null) q.set("m", a.wantsMattress ? "1" : "0");
  return q;
}

export function answersQuery(a: Answers): string {
  return encodeAnswers(a).toString();
}

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function parseAnswers(sp: SearchParams): Answers {
  const s = first(sp.s);
  const c = first(sp.c);
  const b = first(sp.b);
  const pb = first(sp.pb);
  const d = first(sp.d);
  const m = first(sp.m);

  const budget: Budget =
    b === "100000" || b === "200000" || b === "300000"
      ? (Number(b) as Budget)
      : null;
  const priceBasis: PriceBasis = pb === "item" ? "product_only" : "total";

  return {
    storage: lookup(STORAGE_CODES, s) ?? DEFAULT_ANSWERS.storage,
    carry: lookup(CARRY_CODES, c) ?? DEFAULT_ANSWERS.carry,
    budget,
    priceBasis,
    delivery: lookup(DELIVERY_CODES, d) ?? DEFAULT_ANSWERS.delivery,
    wantsMattress: m === "1" ? true : m === "0" ? false : null,
  };
}

/** 답변이 실제로 입력되었는지 (질문을 건너뛰고 결과로 직행하는 것 방지용) */
export function hasAnswers(sp: SearchParams): boolean {
  return Boolean(
    lookup(STORAGE_CODES, first(sp.s)) && lookup(CARRY_CODES, first(sp.c))
  );
}

// ---------- 한국어 요약 (화면5 조건 요약, 결과 상단 조건 바) ----------

export const STORAGE_ANSWER_LABELS: Record<StorageAnswer, string> = {
  big_items: "큰 짐 수납 필요",
  drawers: "서랍 수납 필요",
  robot_vacuum: "로봇청소기 사용",
  closed: "하부 먼지 차단",
  any: "수납 상관없음",
};

export const CARRY_ANSWER_LABELS: Record<CarryAnswer, string> = {
  both_ok: "운반·조립 직접 가능",
  assembly_only: "운반은 어려움 · 조립 가능",
  carry_only: "운반 가능 · 조립은 어려움",
  need_both: "운반·조립 서비스 모두 필요",
  friend_help: "친구 도움 가능",
};

export const DELIVERY_ANSWER_LABELS: Record<DeliveryAnswer, string> = {
  this_week: "일주일 안 배송",
  two_weeks: "2주 안 배송",
  one_month: "한 달 안 배송",
  any: "배송 시기 상관없음",
};

export function budgetLabel(a: Answers): string {
  if (a.budget === null) return "예산 상관없음";
  const amount = `${a.budget / 10000}만원 이하`;
  return a.priceBasis === "total" ? `총비용 ${amount}` : `상품가 ${amount}`;
}

/** 조건 요약 칩 목록 */
export function summarizeAnswers(a: Answers): string[] {
  const chips = [
    STORAGE_ANSWER_LABELS[a.storage],
    CARRY_ANSWER_LABELS[a.carry],
    budgetLabel(a),
    DELIVERY_ANSWER_LABELS[a.delivery],
  ];
  if (a.wantsMattress === true) chips.push("매트리스 포함 희망");
  return chips;
}

/** 조건 충돌 안내 (화면5) — 예: 대형 수납 ↔ 로봇청소기 */
export function conflictWarnings(a: Answers): string[] {
  const warnings: string[] = [];
  if (a.storage === "big_items" && a.budget === 100000) {
    warnings.push(
      "큰 짐 수납(리프트업) 침대는 10만원 이하가 드물어요. 후보가 없으면 예산을 조금 늘려보세요."
    );
  }
  if (a.storage === "big_items" && a.delivery === "this_week") {
    warnings.push(
      "대형 수납 침대는 배송이 2주 이상 걸리는 경우가 많아요. 후보가 없으면 배송 기한을 늘려보세요."
    );
  }
  return warnings;
}
