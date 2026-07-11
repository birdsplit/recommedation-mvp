import "server-only";

import {
  PRODUCT_STATUS_LABELS,
  REVIEW_RISKS,
  ROBOT_FIT_LABELS,
  STALE_VERIFIED_DAYS,
  STORAGE_TYPE_LABELS,
  type ProductStatus,
  type ReviewRisk,
} from "@/lib/constants";
import type {
  Capacity,
  DataConfidence,
  Dust,
  InstallationService,
  Level3,
  Product,
  SelfAssembly,
} from "@/lib/reco/types";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase";
import { isUuid } from "@/lib/uuid";

export type ProductFormValues = Omit<
  Product,
  "id" | "created_at" | "updated_at"
>;

export type ProductFieldErrors = Record<string, string>;

export type ProductParseResult =
  | { success: true; data: ProductFormValues }
  | { success: false; errors: ProductFieldErrors };

export type AdminProductListResult =
  | { state: "ready"; products: Product[] }
  | { state: "setup-required"; products: [] }
  | { state: "error"; products: []; message: string };

export type AdminProductResult =
  | { state: "ready"; product: Product | null }
  | { state: "setup-required"; product: null }
  | { state: "error"; product: null; message: string };

export class PublicProductSourceRequiredError extends Error {
  constructor() {
    super("공개 상품에는 정보 출처를 입력해 주세요.");
    this.name = "PublicProductSourceRequiredError";
  }
}

const INSTALLATION_SERVICES = ["none", "paid", "included", "unknown"] as const;
const CAPACITIES = ["large", "medium", "small", "none"] as const;
const LEVELS = ["easy", "medium", "hard"] as const;
const DUST_LEVELS = ["high", "medium", "low"] as const;
const SELF_ASSEMBLY_LEVELS = [
  "easy",
  "medium",
  "hard",
  "not_possible",
] as const;
const DATA_CONFIDENCE = ["confirmed", "estimated"] as const;
const PRODUCT_STATUSES = Object.keys(PRODUCT_STATUS_LABELS) as ProductStatus[];
const STORAGE_TYPES = Object.keys(STORAGE_TYPE_LABELS) as ProductFormValues["storage_type"][];
const ROBOT_FITS = Object.keys(ROBOT_FIT_LABELS) as NonNullable<
  ProductFormValues["robot_vacuum_fit"]
>[];
const REVIEW_RISK_KEYS = Object.keys(REVIEW_RISKS) as ReviewRisk[];
const POSTGRES_INTEGER_MAX = 2_147_483_647;

export function hasRequiredPublicSource(
  status: ProductStatus,
  sourceNote: string | null
): boolean {
  return status !== "public" || Boolean(sourceNote?.trim());
}

function assertRequiredPublicSource(
  status: ProductStatus,
  sourceNote: string | null
): void {
  if (!hasRequiredPublicSource(status, sourceNote)) {
    throw new PublicProductSourceRequiredError();
  }
}

function dateOnlyToUtc(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const milliseconds = Date.UTC(year, month - 1, day);
  const parsed = new Date(milliseconds);

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return milliseconds;
}

export function todayInSeoul(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function verificationAgeInDays(
  lastVerifiedAt: string,
  today = todayInSeoul()
): number | null {
  const verified = dateOnlyToUtc(lastVerifiedAt);
  const current = dateOnlyToUtc(today);
  if (verified === null || current === null) return null;
  return Math.floor((current - verified) / 86_400_000);
}

export function isProductVerificationStale(
  lastVerifiedAt: string,
  today = todayInSeoul()
): boolean {
  const age = verificationAgeInDays(lastVerifiedAt, today);
  return age === null || age > STALE_VERIFIED_DAYS;
}

export function createEmptyProductFormValues(
  today = todayInSeoul()
): ProductFormValues {
  return {
    name: "",
    seller_name: "",
    seller_url: "",
    image_url: null,
    price: 0,
    shipping_fee: 0,
    installation_service: "none",
    installation_fee: null,
    mattress_included: false,
    mattress_price: null,
    delivery_days_min: 0,
    delivery_days_max: 0,
    scheduled_delivery: false,
    width_cm: null,
    length_cm: null,
    height_cm: null,
    bed_size: "SS",
    material: null,
    storage_type: "none",
    under_bed_clearance_cm: null,
    has_outlet: false,
    has_headboard: false,
    colors: [],
    storage_capacity: null,
    dust_blocking: null,
    cleaning_ease: null,
    robot_vacuum_fit: null,
    carry_difficulty: null,
    carry_service_available: false,
    self_assembly: null,
    assembly_service_available: false,
    assembly_people: 1,
    assembly_tools: null,
    disassembly_ease: null,
    review_risks: [],
    recommended_for: null,
    not_recommended_for: null,
    data_confidence: "estimated",
    source_note: null,
    last_verified_at: today,
    status: "hidden",
  };
}

function rawString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function setError(
  errors: ProductFieldErrors,
  field: string,
  message: string
): void {
  if (!errors[field]) errors[field] = message;
}

function requiredText(
  formData: FormData,
  name: string,
  label: string,
  errors: ProductFieldErrors,
  maxLength: number
): string {
  const value = rawString(formData, name);
  if (!value) setError(errors, name, `${label}을(를) 입력해 주세요.`);
  if (value.length > maxLength) {
    setError(errors, name, `${label}은(는) ${maxLength}자 이하여야 합니다.`);
  }
  return value;
}

function optionalText(
  formData: FormData,
  name: string,
  label: string,
  errors: ProductFieldErrors,
  maxLength: number
): string | null {
  const value = rawString(formData, name);
  if (!value) return null;
  if (value.length > maxLength) {
    setError(errors, name, `${label}은(는) ${maxLength}자 이하여야 합니다.`);
  }
  return value;
}

function validHttpUrl(
  formData: FormData,
  name: string,
  label: string,
  errors: ProductFieldErrors,
  required: boolean
): string | null {
  const value = rawString(formData, name);
  if (!value) {
    if (required) setError(errors, name, `${label}을(를) 입력해 주세요.`);
    return null;
  }
  if (value.length > 2_000) {
    setError(errors, name, `${label}은(는) 2,000자 이하여야 합니다.`);
    return value;
  }
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password
    ) {
      throw new Error("invalid protocol or credentials");
    }
  } catch {
    setError(errors, name, `${label}은(는) http(s) 주소로 입력해 주세요.`);
  }
  return value;
}

function integerValue(
  formData: FormData,
  name: string,
  label: string,
  errors: ProductFieldErrors,
  options: { nullable?: boolean; min?: number; max?: number } = {}
): number | null {
  const value = rawString(formData, name);
  if (!value) {
    if (!options.nullable) setError(errors, name, `${label}을(를) 입력해 주세요.`);
    return null;
  }

  if (!/^-?\d+$/.test(value)) {
    setError(errors, name, `${label}은(는) 정수로 입력해 주세요.`);
    return null;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    setError(errors, name, `${label} 값이 너무 큽니다.`);
    return null;
  }
  if (options.min !== undefined && parsed < options.min) {
    setError(errors, name, `${label}은(는) ${options.min} 이상이어야 합니다.`);
  }
  if (options.max !== undefined && parsed > options.max) {
    setError(errors, name, `${label}은(는) ${options.max} 이하여야 합니다.`);
  }
  return parsed;
}

function enumValue<T extends string>(
  formData: FormData,
  name: string,
  label: string,
  allowed: readonly T[],
  errors: ProductFieldErrors,
  nullable = false
): T | null {
  const value = rawString(formData, name);
  if (!value && nullable) return null;
  if (!allowed.includes(value as T)) {
    setError(errors, name, `${label} 값을 다시 선택해 주세요.`);
    return null;
  }
  return value as T;
}

function checkboxValue(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

function stringList(formData: FormData, name: string): string[] {
  return rawString(formData, name)
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index);
}

/**
 * Server Action 경계에서 사용하는 전체 상품 폼 검증.
 * 브라우저의 required/min 속성은 편의 기능일 뿐이므로 여기서 모든 값을 다시 제한한다.
 */
export function parseProductFormData(
  formData: FormData,
  today = todayInSeoul()
): ProductParseResult {
  const errors: ProductFieldErrors = {};

  const name = requiredText(formData, "name", "상품명", errors, 200);
  const sellerName = requiredText(
    formData,
    "seller_name",
    "판매처",
    errors,
    200
  );
  const sellerUrl = validHttpUrl(
    formData,
    "seller_url",
    "판매 링크",
    errors,
    true
  );
  const imageUrl = validHttpUrl(
    formData,
    "image_url",
    "이미지 주소",
    errors,
    false
  );
  const price = integerValue(formData, "price", "상품가", errors, {
    min: 0,
    max: POSTGRES_INTEGER_MAX,
  });
  const shippingFee = integerValue(
    formData,
    "shipping_fee",
    "배송비",
    errors,
    { min: 0, max: POSTGRES_INTEGER_MAX }
  );
  const installationService = enumValue(
    formData,
    "installation_service",
    "설치 서비스",
    INSTALLATION_SERVICES,
    errors
  ) as InstallationService | null;
  const installationFee = integerValue(
    formData,
    "installation_fee",
    "설치비",
    errors,
    { nullable: true, min: 0, max: POSTGRES_INTEGER_MAX }
  );
  const mattressIncluded = checkboxValue(formData, "mattress_included");
  const mattressPrice = integerValue(
    formData,
    "mattress_price",
    "매트리스 예상가",
    errors,
    { nullable: true, min: 0, max: POSTGRES_INTEGER_MAX }
  );
  const deliveryDaysMin = integerValue(
    formData,
    "delivery_days_min",
    "최소 배송일",
    errors,
    { min: 0, max: 365 }
  );
  const deliveryDaysMax = integerValue(
    formData,
    "delivery_days_max",
    "최대 배송일",
    errors,
    { min: 0, max: 365 }
  );
  const widthCm = integerValue(formData, "width_cm", "가로", errors, {
    nullable: true,
    min: 1,
    max: 1_000,
  });
  const lengthCm = integerValue(formData, "length_cm", "세로", errors, {
    nullable: true,
    min: 1,
    max: 1_000,
  });
  const heightCm = integerValue(formData, "height_cm", "높이", errors, {
    nullable: true,
    min: 1,
    max: 1_000,
  });
  const bedSize = rawString(formData, "bed_size");
  if (bedSize !== "SS") {
    setError(errors, "bed_size", "MVP 침대 규격은 SS만 등록할 수 있습니다.");
  }
  const storageType = enumValue(
    formData,
    "storage_type",
    "수납 방식",
    STORAGE_TYPES,
    errors
  );
  const underBedClearanceCm = integerValue(
    formData,
    "under_bed_clearance_cm",
    "하부 높이",
    errors,
    { nullable: true, min: 0, max: 1_000 }
  );
  const colors = stringList(formData, "colors");
  if (colors.length > 20 || colors.some((color) => color.length > 50)) {
    setError(
      errors,
      "colors",
      "색상은 50자 이하의 값으로 최대 20개까지 입력해 주세요."
    );
  }
  const storageCapacity = enumValue(
    formData,
    "storage_capacity",
    "예상 수납력",
    CAPACITIES,
    errors,
    true
  ) as Capacity | null;
  const dustBlocking = enumValue(
    formData,
    "dust_blocking",
    "먼지 차단",
    DUST_LEVELS,
    errors,
    true
  ) as Dust | null;
  const cleaningEase = enumValue(
    formData,
    "cleaning_ease",
    "청소 편의",
    LEVELS,
    errors,
    true
  ) as Level3 | null;
  const robotVacuumFit = enumValue(
    formData,
    "robot_vacuum_fit",
    "로봇청소기 가능성",
    ROBOT_FITS,
    errors,
    true
  );
  const carryDifficulty = enumValue(
    formData,
    "carry_difficulty",
    "운반 난이도",
    LEVELS,
    errors,
    true
  ) as Level3 | null;
  const selfAssembly = enumValue(
    formData,
    "self_assembly",
    "직접 조립 난이도",
    SELF_ASSEMBLY_LEVELS,
    errors,
    true
  ) as SelfAssembly | null;
  const assemblyPeople = integerValue(
    formData,
    "assembly_people",
    "필요 인원",
    errors,
    { min: 1, max: 20 }
  );
  const disassemblyEase = enumValue(
    formData,
    "disassembly_ease",
    "분해 편의",
    LEVELS,
    errors,
    true
  ) as Level3 | null;
  const reviewRiskValues = formData
    .getAll("review_risks")
    .filter((value): value is string => typeof value === "string");
  const reviewRisks = [
    ...new Set(
      reviewRiskValues.filter((value): value is ReviewRisk =>
        REVIEW_RISK_KEYS.includes(value as ReviewRisk)
      )
    ),
  ];
  if (
    reviewRiskValues.length !== reviewRisks.length ||
    reviewRiskValues.some((value) => !REVIEW_RISK_KEYS.includes(value as ReviewRisk))
  ) {
    setError(errors, "review_risks", "리뷰 리스크 값을 다시 선택해 주세요.");
  }
  const dataConfidence = enumValue(
    formData,
    "data_confidence",
    "정보 신뢰도",
    DATA_CONFIDENCE,
    errors
  ) as DataConfidence | null;
  const status = enumValue(
    formData,
    "status",
    "상품 상태",
    PRODUCT_STATUSES,
    errors
  );
  const lastVerifiedAt = rawString(formData, "last_verified_at");
  const verifiedDate = dateOnlyToUtc(lastVerifiedAt);
  const todayDate = dateOnlyToUtc(today);
  if (verifiedDate === null) {
    setError(errors, "last_verified_at", "올바른 확인일을 입력해 주세요.");
  } else if (todayDate !== null && verifiedDate > todayDate) {
    setError(errors, "last_verified_at", "마지막 확인일은 오늘 이후일 수 없습니다.");
  }

  const assemblyServiceAvailable = checkboxValue(
    formData,
    "assembly_service_available"
  );
  if (
    installationService &&
    ["paid", "included"].includes(installationService) &&
    !assemblyServiceAvailable
  ) {
    setError(
      errors,
      "assembly_service_available",
      "유료·포함 설치 상품은 조립 서비스 제공 여부를 선택해야 합니다."
    );
  }
  if (selfAssembly === "not_possible" && !assemblyServiceAvailable) {
    setError(
      errors,
      "assembly_service_available",
      "직접 조립 불가 상품은 조립 서비스가 제공되어야 합니다."
    );
  }
  if (
    deliveryDaysMin !== null &&
    deliveryDaysMax !== null &&
    deliveryDaysMin > deliveryDaysMax
  ) {
    setError(
      errors,
      "delivery_days_max",
      "최대 배송일은 최소 배송일 이상이어야 합니다."
    );
  }

  const material = optionalText(formData, "material", "소재", errors, 200);
  const assemblyTools = optionalText(
    formData,
    "assembly_tools",
    "필요 공구",
    errors,
    300
  );
  const recommendedFor = optionalText(
    formData,
    "recommended_for",
    "추천 대상",
    errors,
    1_000
  );
  const notRecommendedFor = optionalText(
    formData,
    "not_recommended_for",
    "비추천 대상",
    errors,
    1_000
  );
  const sourceNote = optionalText(
    formData,
    "source_note",
    "정보 출처·지역 제한 메모",
    errors,
    1_000
  );
  if (
    status &&
    !hasRequiredPublicSource(status as ProductStatus, sourceNote)
  ) {
    setError(
      errors,
      "source_note",
      "공개 상품에는 정보 출처를 입력해 주세요."
    );
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      name,
      seller_name: sellerName,
      seller_url: sellerUrl as string,
      image_url: imageUrl,
      price: price as number,
      shipping_fee: shippingFee as number,
      installation_service: installationService as InstallationService,
      installation_fee: installationFee,
      mattress_included: mattressIncluded,
      mattress_price: mattressPrice,
      delivery_days_min: deliveryDaysMin as number,
      delivery_days_max: deliveryDaysMax as number,
      scheduled_delivery: checkboxValue(formData, "scheduled_delivery"),
      width_cm: widthCm,
      length_cm: lengthCm,
      height_cm: heightCm,
      bed_size: "SS",
      material,
      storage_type: storageType as ProductFormValues["storage_type"],
      under_bed_clearance_cm: underBedClearanceCm,
      has_outlet: checkboxValue(formData, "has_outlet"),
      has_headboard: checkboxValue(formData, "has_headboard"),
      colors,
      storage_capacity: storageCapacity,
      dust_blocking: dustBlocking,
      cleaning_ease: cleaningEase,
      robot_vacuum_fit: robotVacuumFit,
      carry_difficulty: carryDifficulty,
      carry_service_available: checkboxValue(
        formData,
        "carry_service_available"
      ),
      self_assembly: selfAssembly,
      assembly_service_available: assemblyServiceAvailable,
      assembly_people: assemblyPeople as number,
      assembly_tools: assemblyTools,
      disassembly_ease: disassemblyEase,
      review_risks: reviewRisks,
      recommended_for: recommendedFor,
      not_recommended_for: notRecommendedFor,
      data_confidence: dataConfidence as DataConfidence,
      source_note: sourceNote,
      last_verified_at: lastVerifiedAt,
      status: status as ProductStatus,
    },
  };
}

export function parseProductStatus(value: FormDataEntryValue | null): ProductStatus | null {
  return typeof value === "string" && PRODUCT_STATUSES.includes(value as ProductStatus)
    ? (value as ProductStatus)
    : null;
}

export async function getAdminProducts(): Promise<AdminProductListResult> {
  if (!isSupabaseConfigured()) {
    return { state: "setup-required", products: [] };
  }

  const { data, error } = await supabaseAdmin()
    .from("products")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    return {
      state: "error",
      products: [],
      message: `상품 목록을 불러오지 못했습니다: ${error.message}`,
    };
  }

  return { state: "ready", products: (data ?? []) as Product[] };
}

export async function getAdminProduct(id: string): Promise<AdminProductResult> {
  if (!isUuid(id)) return { state: "ready", product: null };
  if (!isSupabaseConfigured()) {
    return { state: "setup-required", product: null };
  }

  const { data, error } = await supabaseAdmin()
    .from("products")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return {
      state: "error",
      product: null,
      message: `상품을 불러오지 못했습니다: ${error.message}`,
    };
  }

  return { state: "ready", product: (data as Product | null) ?? null };
}

export async function insertAdminProduct(
  values: ProductFormValues
): Promise<{ id: string }> {
  assertRequiredPublicSource(values.status, values.source_note);
  const { data, error } = await supabaseAdmin()
    .from("products")
    .insert(values)
    .select("id")
    .single();
  if (error) throw new Error(`상품 등록 실패: ${error.message}`);
  return data as { id: string };
}

export async function updateAdminProduct(
  id: string,
  values: ProductFormValues
): Promise<void> {
  assertRequiredPublicSource(values.status, values.source_note);
  const { data, error } = await supabaseAdmin()
    .from("products")
    .update(values)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`상품 수정 실패: ${error.message}`);
  if (!data) throw new Error("수정할 상품을 찾지 못했습니다.");
}

export async function updateAdminProductStatus(
  id: string,
  status: ProductStatus
): Promise<void> {
  const client = supabaseAdmin();

  if (status === "public") {
    const { data: product, error: readError } = await client
      .from("products")
      .select("source_note")
      .eq("id", id)
      .maybeSingle();
    if (readError) {
      throw new Error(`상품 출처 확인 실패: ${readError.message}`);
    }
    if (!product) throw new Error("상태를 변경할 상품을 찾지 못했습니다.");
    assertRequiredPublicSource(status, product.source_note);
  }

  const { data, error } = await client
    .from("products")
    .update({ status })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`상품 상태 변경 실패: ${error.message}`);
  if (!data) throw new Error("상태를 변경할 상품을 찾지 못했습니다.");
}
