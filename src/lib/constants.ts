/** 서비스명 — 임시. 확정되면 여기 한 줄만 변경 */
export const SERVICE_NAME = "모두의침대";

/** 기획서 §8.3 리뷰 리스크 태그 10종 (products.review_risks 값) */
export const REVIEW_RISKS = {
  squeak: "삐걱거림",
  wobble: "흔들림",
  smell: "냄새",
  assembly_hard: "조립 어려움",
  manual_poor: "설명서 부족",
  missing_parts: "부품 누락",
  delivery_delay: "배송 지연",
  finish_poor: "마감 불량",
  drawer_awkward: "서랍 불편",
  extra_cost: "추가 비용",
} as const;

export type ReviewRisk = keyof typeof REVIEW_RISKS;

/** 기획서 §11.1 측정 이벤트 12종 (events.event_type 값) */
export const EVENT_TYPES = [
  "visit",
  "start_click",
  "question_answer",
  "questions_complete",
  "summary_view",
  "results_view",
  "product_detail_view",
  "compare_add",
  "cost_check",
  "outbound_click",
  "source_open",
  "feedback_submit",
  "post_purchase_submit",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/** products.storage_type 라벨 */
export const STORAGE_TYPE_LABELS = {
  lift_up: "리프트업 수납 (큰 짐)",
  drawer: "서랍 수납",
  legs_open: "다리형 (하부 개방)",
  closed_base: "평상형 (하부 막힘)",
  none: "수납 없음",
} as const;

export type StorageType = keyof typeof STORAGE_TYPE_LABELS;

/** products.robot_vacuum_fit 라벨 */
export const ROBOT_FIT_LABELS = {
  ok: "로봇청소기 가능",
  check_height: "하부 높이 확인 필요",
  no: "로봇청소기 불가",
} as const;

export type RobotFit = keyof typeof ROBOT_FIT_LABELS;

/** products.status 라벨 (기획서 §8.2) */
export const PRODUCT_STATUS_LABELS = {
  public: "공개",
  hidden: "비공개",
  sold_out: "품절",
  needs_check: "정보 확인 필요",
} as const;

export type ProductStatus = keyof typeof PRODUCT_STATUS_LABELS;

/** 추천 수준 (기획서 화면6) — 근거 불명확한 점수 표기 금지, 3단계 티어만 사용 */
export const TIER_LABELS = {
  great: "매우 적합",
  conditional: "조건부 적합",
  not_fit: "비추천",
} as const;

export type Tier = keyof typeof TIER_LABELS;

/** 마지막 확인일이 이 일수를 넘으면 관리자 목록에서 경고 표시 */
export const STALE_VERIFIED_DAYS = 14;

/** 비교함 최대 개수 (기획서 §7.1) */
export const COMPARE_MAX = 3;
