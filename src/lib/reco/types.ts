import type {
  ProductStatus,
  ReviewRisk,
  RobotFit,
  StorageType,
  Tier,
} from "@/lib/constants";

export type Level3 = "easy" | "medium" | "hard";
export type Capacity = "large" | "medium" | "small" | "none";
export type Dust = "high" | "medium" | "low";
export type SelfAssembly = "easy" | "medium" | "hard" | "not_possible";
export type InstallationService = "none" | "paid" | "included" | "unknown";
export type DataConfidence = "confirmed" | "estimated";
export type FieldConfidence = DataConfidence | "unknown";
export type ProductAvailability =
  | "in_stock"
  | "out_of_stock"
  | "preorder"
  | "unknown";

export interface ProductEvidenceSnapshot {
  id: number;
  field_group:
    | "identity"
    | "commercial"
    | "delivery"
    | "spec"
    | "review"
    | "policy"
    | "catalog";
  field_names: string[];
  source_url: string;
  confidence: FieldConfidence;
  verified_at: string;
  verified_by: string;
  notes?: string | null;
}

/** products 테이블 행 (supabase/schema.sql과 1:1) */
export interface Product {
  id: string;
  /** 실카탈로그 행에만 존재하며 데모 fixture에서는 생략될 수 있다. */
  internal_key?: string;
  offer_id?: string;
  variant_key?: string;
  option_name?: string;
  availability?: ProductAvailability;
  source_url?: string;
  evidence?: ProductEvidenceSnapshot[];
  commercial_verified_at?: string;
  spec_verified_at?: string;
  name: string;
  seller_name: string;
  seller_url: string;
  image_url: string | null;
  price: number;
  shipping_fee: number;
  /** 이전 카탈로그 행에는 없을 수 있어 optional로 읽는다. */
  shipping_fee_confidence?: FieldConfidence;
  installation_service: InstallationService;
  installation_fee: number | null;
  mattress_included: boolean;
  mattress_price: number | null;
  delivery_days_min: number;
  delivery_days_max: number;
  scheduled_delivery: boolean;
  width_cm: number | null;
  length_cm: number | null;
  height_cm: number | null;
  bed_size: string;
  material: string | null;
  storage_type: StorageType;
  under_bed_clearance_cm: number | null;
  has_outlet: boolean;
  has_headboard: boolean;
  colors: string[];
  storage_capacity: Capacity | null;
  dust_blocking: Dust | null;
  cleaning_ease: Level3 | null;
  robot_vacuum_fit: RobotFit | null;
  carry_difficulty: Level3 | null;
  carry_service_available: boolean;
  self_assembly: SelfAssembly | null;
  assembly_service_available: boolean;
  assembly_people: number;
  assembly_tools: string | null;
  disassembly_ease: Level3 | null;
  review_risks: ReviewRisk[];
  return_policy_summary?: string | null;
  damage_process_summary?: string | null;
  warranty_summary?: string | null;
  review_sample_count?: number;
  review_risk_counts?: Partial<Record<ReviewRisk, number>>;
  review_verified_at?: string | null;
  review_rechecked_count?: number;
  recommended_for: string | null;
  not_recommended_for: string | null;
  data_confidence: DataConfidence;
  source_note: string | null;
  /** 레거시 DB 기본값과 실제 미확인 값을 구분하는 카탈로그 필드명 목록 */
  unknown_fields?: string[];
  last_verified_at: string;
  status: ProductStatus;
  created_at: string;
  updated_at: string;
}

/** 질문 1 — 침대 밑 공간 (화면2) */
export type StorageAnswer =
  | "big_items"
  | "drawers"
  | "robot_vacuum"
  | "closed"
  | "any";

/** 질문 2 — 운반과 조립을 각각 어떻게 해결할지 */
export type AssistanceAnswer = "self" | "friend" | "service";
export type CarryAnswer = AssistanceAnswer;
export type AssemblyAnswer = AssistanceAnswer;

/** 질문 3 — 배송 시기 (화면4) */
export type DeliveryAnswer = "this_week" | "two_weeks" | "one_month" | "any";

export type PriceBasis = "product_only" | "total";

export type Budget = 100000 | 200000 | 300000 | null;

export interface Answers {
  storage: StorageAnswer;
  carry: CarryAnswer;
  assembly: AssemblyAnswer;
  budget: Budget; // null = 상관없음/건너뜀
  priceBasis: PriceBasis;
  delivery: DeliveryAnswer;
  wantsMattress: boolean | null; // null = 선택 안 함
}

/** 총비용 분해 (기획서 제품 원칙 3·7 — 모르는 비용은 숫자로 지어내지 않는다) */
export interface CostBreakdown {
  price: number;
  shippingFee: number;
  /** 사용자에게 설치(조립) 서비스가 필요한 상황인지 */
  installationNeeded: boolean;
  /** 필요할 때의 설치비. null = 필요하지만 금액 미확인 */
  installationFee: number | null;
  /** 매트리스가 필요한데 미포함인 상황인지 */
  mattressNeeded: boolean;
  /** 필요할 때의 매트리스 별도가. null = 필요하지만 금액 미확인 */
  mattressPrice: number | null;
  /** 알 수 있는 항목만 합산한 총비용 */
  knownTotal: number;
  /** 금액을 알 수 없어 총비용에서 빠진 항목 (한국어) */
  unknownParts: string[];
}

export type ConditionStatus = "met" | "unknown" | "not_met";

/** 필수조건 충족표 한 행 (화면7 섹션 1) */
export interface ConditionCheck {
  key: "budget" | "delivery" | "storage" | "carry" | "assembly" | "size";
  label: string;
  status: ConditionStatus;
  /** 추천 후보 필터와 충족 개수에 포함되는 사용자의 선택 조건인지 */
  required: boolean;
  note?: string;
  evidenceIds?: string[];
}

/** 이유/주의 — text는 문장, core는 최종 한 문장 조립용 짧은 명사구 */
export interface Reason {
  text: string;
  core: string;
  weight: number;
}

export interface Recommendation {
  product: Product;
  tier: Tier;
  /** 선택한 필수조건 전체의 판정. size 같은 안내 항목은 제외한다. */
  conditionStatus: ConditionStatus;
  /** 내부 정렬 전용 — UI에 숫자로 노출 금지 (기획서 화면6 표시 원칙) */
  score: number;
  cost: CostBreakdown;
  checks: ConditionCheck[];
  passCount: number;
  totalChecks: number;
  unknownCount: number;
  /** 동점 정렬용 내부 지표. UI에 정확도처럼 노출하지 않는다. */
  dataCompleteness: number;
  prefCount: number;
  riskCount: number;
  fitReasons: Reason[]; // 항상 2개
  cautions: Reason[]; // 항상 1개 이상 (카드에는 [0]만 노출)
  finalJudgment: string;
}

export interface RelaxSuggestion {
  /** 예: "배송일을 한 달 안으로 늘리면" */
  label: string;
  /** 완화 시 새로 추가되는 후보 수 */
  gained: number;
  /** 완화된 조건의 Answers (링크 생성용) */
  relaxed: Answers;
}

export interface RecommendResult {
  candidates: Recommendation[]; // 최대 3, 비추천 티어 미포함
  totalReviewed: number; // status='public' 상품 수
  relaxSuggestions: RelaxSuggestion[]; // 후보가 3개 미만일 때만 채움
}
