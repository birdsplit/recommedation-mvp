import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";

const { loadEnvConfig } = nextEnv;

export const DEFAULT_CATALOG_FILE = "data/catalog-products.csv";
export const CATALOG_COLUMNS = [
  "internal_key",
  "name",
  "seller_name",
  "offer_id",
  "variant_key",
  "option_name",
  "seller_url",
  "source_url",
  "availability",
  "price",
  "shipping_fee",
  "shipping_fee_confidence",
  "installation_service",
  "installation_fee",
  "mattress_included",
  "mattress_price",
  "delivery_days_min",
  "delivery_days_max",
  "scheduled_delivery",
  "width_cm",
  "length_cm",
  "height_cm",
  "bed_size",
  "material",
  "storage_type",
  "under_bed_clearance_cm",
  "has_outlet",
  "has_headboard",
  "colors",
  "storage_capacity",
  "dust_blocking",
  "cleaning_ease",
  "robot_vacuum_fit",
  "carry_difficulty",
  "carry_service_available",
  "self_assembly",
  "assembly_service_available",
  "assembly_people",
  "assembly_tools",
  "disassembly_ease",
  "review_risks",
  "recommended_for",
  "not_recommended_for",
  "data_confidence",
  "source_note",
  "commercial_verified_at",
  "spec_verified_at",
  "status",
  "verified_by",
  "evidence_confidence",
  "evidence_notes",
  "image_url",
];

/** 숨은 초안과의 호환을 유지하면서 공개 전 반드시 보완할 확장 조사 필드. */
export const OPTIONAL_CATALOG_COLUMNS = [
  "return_policy_summary",
  "damage_process_summary",
  "warranty_summary",
  "review_sample_count",
  "review_risk_counts",
  "review_verified_at",
  "review_rechecked_count",
  "commercial_source_url",
  "delivery_source_url",
  "spec_source_url",
  "policy_source_url",
  "review_source_url",
  "commercial_confidence",
  "delivery_confidence",
  "spec_confidence",
  "policy_confidence",
  "review_confidence",
];

export const PRODUCT_WRITE_FIELDS = [
  "internal_key",
  "name",
  "seller_name",
  "offer_id",
  "variant_key",
  "option_name",
  "seller_url",
  "source_url",
  "availability",
  "price",
  "shipping_fee",
  "shipping_fee_confidence",
  "unknown_fields",
  "installation_service",
  "installation_fee",
  "mattress_included",
  "mattress_price",
  "delivery_days_min",
  "delivery_days_max",
  "scheduled_delivery",
  "width_cm",
  "length_cm",
  "height_cm",
  "bed_size",
  "material",
  "storage_type",
  "under_bed_clearance_cm",
  "has_outlet",
  "has_headboard",
  "colors",
  "storage_capacity",
  "dust_blocking",
  "cleaning_ease",
  "robot_vacuum_fit",
  "carry_difficulty",
  "carry_service_available",
  "self_assembly",
  "assembly_service_available",
  "assembly_people",
  "assembly_tools",
  "disassembly_ease",
  "review_risks",
  "return_policy_summary",
  "damage_process_summary",
  "warranty_summary",
  "review_sample_count",
  "review_risk_counts",
  "review_verified_at",
  "review_rechecked_count",
  "recommended_for",
  "not_recommended_for",
  "data_confidence",
  "source_note",
  "last_verified_at",
  "commercial_verified_at",
  "spec_verified_at",
  "status",
  "image_url",
];

const REVIEW_RISKS = new Set([
  "squeak",
  "wobble",
  "smell",
  "assembly_hard",
  "manual_poor",
  "missing_parts",
  "delivery_delay",
  "finish_poor",
  "drawer_awkward",
  "extra_cost",
]);
const EVIDENCE_FIELD_NAMES = PRODUCT_WRITE_FIELDS.filter(
  (field) => !["status", "last_verified_at"].includes(field)
);
const DAY_MS = 86_400_000;

function issue(severity, row, field, message) {
  return { severity, row, field, message };
}

function raw(record, field) {
  return String(record[field] ?? "").trim();
}

function textValue(record, field, issues, { required = false, fallback = "" } = {}) {
  const value = raw(record, field);
  if (required && value === "") {
    issues.push(issue("error", record.__row, field, "필수값입니다."));
    return fallback;
  }
  return value === "" ? null : value;
}

function integerValue(
  record,
  field,
  issues,
  { required = false, min = 0, nullable = true, fallback = 0 } = {}
) {
  const value = raw(record, field);
  if (value === "") {
    if (required) issues.push(issue("error", record.__row, field, "정수가 필요합니다."));
    return nullable ? null : fallback;
  }
  if (!/^-?\d+$/.test(value)) {
    issues.push(issue("error", record.__row, field, "정수 형식이어야 합니다."));
    return nullable ? null : fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > 2_147_483_647) {
    issues.push(
      issue("error", record.__row, field, `${min}~2147483647 범위여야 합니다.`)
    );
    return nullable ? null : fallback;
  }
  return parsed;
}

function decimalValue(record, field, issues, { min = 0.01 } = {}) {
  const value = raw(record, field);
  if (value === "") return null;
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) {
    issues.push(issue("error", record.__row, field, "소수 둘째 자리까지의 숫자여야 합니다."));
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > 99_999.99) {
    issues.push(issue("error", record.__row, field, `${min}~99999.99 범위여야 합니다.`));
    return null;
  }
  return parsed;
}

function enumValue(record, field, issues, allowed, { required = false, fallback = null } = {}) {
  const value = raw(record, field);
  if (value === "") {
    if (required) issues.push(issue("error", record.__row, field, "필수 선택값입니다."));
    return fallback;
  }
  if (!allowed.includes(value)) {
    issues.push(
      issue("error", record.__row, field, `허용값: ${allowed.join(" | ")}`)
    );
    return fallback;
  }
  return value;
}

function booleanValue(record, field, issues, unknownFields) {
  const value = raw(record, field).toLowerCase();
  if (value === "") {
    unknownFields.push(field);
    return false;
  }
  if (["true", "1", "yes", "y"].includes(value)) return true;
  if (["false", "0", "no", "n"].includes(value)) return false;
  issues.push(issue("error", record.__row, field, "true 또는 false여야 합니다."));
  return false;
}

function listValue(record, field) {
  return [...new Set(raw(record, field).split("|").map((item) => item.trim()).filter(Boolean))];
}

function riskCountsValue(record, issues) {
  const value = raw(record, "review_risk_counts");
  if (value === "") return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("object required");
    }
    const counts = {};
    for (const [risk, count] of Object.entries(parsed)) {
      if (!REVIEW_RISKS.has(risk) || !Number.isInteger(count) || count < 0 || count > 10) {
        throw new Error("invalid risk/count");
      }
      counts[risk] = count;
    }
    return counts;
  } catch {
    issues.push(
      issue(
        "error",
        record.__row,
        "review_risk_counts",
        'JSON 객체 형식이어야 합니다. 예: {"squeak":2,"wobble":1}'
      )
    );
    return {};
  }
}

function dateValue(record, field, issues) {
  const value = raw(record, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    issues.push(issue("error", record.__row, field, "YYYY-MM-DD 날짜가 필요합니다."));
    return "1970-01-01";
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    issues.push(issue("error", record.__row, field, "실재하는 날짜가 아닙니다."));
    return "1970-01-01";
  }
  return value;
}

function optionalDateValue(record, field, issues) {
  if (raw(record, field) === "") return null;
  return dateValue(record, field, issues);
}

function urlValue(record, field, issues, { required = false } = {}) {
  const value = textValue(record, field, issues, { required });
  if (value === null) return null;
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error("unsafe URL");
    }
  } catch {
    issues.push(issue("error", record.__row, field, "안전한 http(s) 절대 URL이어야 합니다."));
  }
  return value;
}

function isRealHttpsUrl(value) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const placeholder =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".invalid") ||
      ["example.com", "example.org", "example.net"].some(
        (domain) => host === domain || host.endsWith(`.${domain}`)
      );
    return parsed.protocol === "https:" && !placeholder;
  } catch {
    return false;
  }
}

function ageInDays(value, asOf) {
  const verified = new Date(`${value}T00:00:00.000Z`).valueOf();
  const reference = new Date(`${asOf}T00:00:00.000Z`).valueOf();
  if (!Number.isFinite(verified) || !Number.isFinite(reference)) return null;
  return Math.floor((reference - verified) / DAY_MS);
}

function validatePublicRow(record, product, evidence, asOf, issues, warnings) {
  if (product.status !== "public") return;
  const evidenceByGroup = new Map(evidence.map((item) => [item.field_group, item]));
  const catalogEvidence = evidenceByGroup.get("catalog");
  if (product.availability !== "in_stock") {
    issues.push(issue("error", record.__row, "availability", "공개 상품은 in_stock이어야 합니다."));
  }
  for (const field of ["seller_url", "source_url"]) {
    if (!isRealHttpsUrl(product[field])) {
      issues.push(
        issue("error", record.__row, field, "공개 상품은 실제 HTTPS URL이어야 합니다.")
      );
    }
  }
  if (!product.source_note?.trim()) {
    issues.push(issue("error", record.__row, "source_note", "공개 상품은 출처 설명이 필요합니다."));
  }
  if (!catalogEvidence?.verified_by.trim()) {
    issues.push(issue("error", record.__row, "verified_by", "공개 상품은 확인자가 필요합니다."));
  }
  if (catalogEvidence?.confidence === "unknown") {
    issues.push(
      issue("error", record.__row, "evidence_confidence", "공개 상품의 핵심 근거는 unknown일 수 없습니다.")
    );
  }
  if (product.bed_size !== "SS") {
    issues.push(
      issue(
        "error",
        record.__row,
        "bed_size",
        "현재 MVP 공개 범위는 슈퍼싱글(SS)만 허용합니다."
      )
    );
  }
  for (const group of ["commercial", "delivery", "spec", "policy", "review"]) {
    const item = evidenceByGroup.get(group);
    if (!item) {
      issues.push(
        issue("error", record.__row, `${group}_source_url`, `${group} 근거 URL이 필요합니다.`)
      );
    } else if (item.confidence !== "confirmed") {
      issues.push(
        issue(
          "error",
          record.__row,
          `${group}_confidence`,
          `${group} 핵심 근거는 confirmed여야 합니다.`
        )
      );
    }
  }
  for (const field of [
    "return_policy_summary",
    "damage_process_summary",
    "warranty_summary",
  ]) {
    if (!product[field]?.trim()) {
      issues.push(issue("error", record.__row, field, "공개 전 소비자 보호 조건 확인이 필요합니다."));
    }
  }
  if (product.review_sample_count < 1 || product.review_sample_count > 10) {
    issues.push(
      issue("error", record.__row, "review_sample_count", "공개 상품은 리뷰 표본 1~10개가 필요합니다.")
    );
  }
  if (!product.review_verified_at) {
    issues.push(issue("error", record.__row, "review_verified_at", "리뷰 표본 확인일이 필요합니다."));
  } else {
    const reviewAge = ageInDays(product.review_verified_at, asOf);
    if (reviewAge === null || reviewAge < 0 || reviewAge > 30) {
      issues.push(issue("error", record.__row, "review_verified_at", "30일 이내 리뷰 재확인이 필요합니다."));
    }
  }
  const requiredRechecks = Math.ceil(product.review_sample_count * 0.2);
  if (product.review_rechecked_count < requiredRechecks) {
    issues.push(
      issue(
        "error",
        record.__row,
        "review_rechecked_count",
        `리뷰 표본의 20% 이상(${requiredRechecks}개)을 재검수해야 합니다.`
      )
    );
  }
  const repeatedRisks = Object.entries(product.review_risk_counts)
    .filter(([, count]) => count >= 2)
    .map(([risk]) => risk)
    .sort();
  const exposedRisks = [...product.review_risks].sort();
  if (JSON.stringify(repeatedRisks) !== JSON.stringify(exposedRisks)) {
    issues.push(
      issue(
        "error",
        record.__row,
        "review_risks",
        "2건 이상 언급된 위험만 review_risks에 정확히 노출해야 합니다."
      )
    );
  }
  for (const [field, limit] of [
    ["commercial_verified_at", 7],
    ["spec_verified_at", 30],
  ]) {
    const age = ageInDays(product[field], asOf);
    if (age === null || age < 0) {
      issues.push(issue("error", record.__row, field, "기준일 이후 날짜는 공개할 수 없습니다."));
    } else if (age > limit) {
      issues.push(issue("error", record.__row, field, `${limit}일 이내 재확인이 필요합니다.`));
    }
  }
  for (const field of ["delivery_days_min", "delivery_days_max"]) {
    if (product.unknown_fields.includes(field)) {
      issues.push(issue("error", record.__row, field, "공개 전 배송기간 확인이 필요합니다."));
    }
  }
  for (const field of ["storage_type", "assembly_people"]) {
    if (product.unknown_fields.includes(field)) {
      issues.push(issue("error", record.__row, field, "공개 전 값을 확인해야 합니다."));
    }
  }
  for (const field of ["width_cm", "length_cm"]) {
    if (product[field] === null) {
      issues.push(issue("error", record.__row, field, "공개 전 정확한 규격 확인이 필요합니다."));
    }
  }
  if (product.shipping_fee_confidence === "unknown") {
    warnings.push(
      issue("warning", record.__row, "shipping_fee", "배송비 미확인 상태가 결과에 명시되어야 합니다.")
    );
  }
}

function normalizeRow(record, asOf, errors, warnings) {
  const rowIssues = [];
  const unknownFields = [];
  const internalKey = textValue(record, "internal_key", rowIssues, { required: true, fallback: "invalid" });
  if (internalKey && (!/^[^\s]{1,160}$/.test(internalKey))) {
    rowIssues.push(issue("error", record.__row, "internal_key", "공백 없이 160자 이하여야 합니다."));
  }
  const sellerUrl = urlValue(record, "seller_url", rowIssues, { required: true });
  const sourceUrl = urlValue(record, "source_url", rowIssues, { required: true });
  const shippingRaw = raw(record, "shipping_fee");
  const shippingFee = shippingRaw === ""
    ? 0
    : integerValue(record, "shipping_fee", rowIssues, { required: true, nullable: false });
  const shippingConfidence = enumValue(
    record,
    "shipping_fee_confidence",
    rowIssues,
    ["confirmed", "estimated", "unknown"],
    { fallback: shippingRaw === "" ? "unknown" : "confirmed" }
  );
  if (shippingRaw === "" && shippingConfidence !== "unknown") {
    rowIssues.push(
      issue("error", record.__row, "shipping_fee_confidence", "빈 배송비는 unknown이어야 합니다.")
    );
  }

  const deliveryMinRaw = raw(record, "delivery_days_min");
  const deliveryMaxRaw = raw(record, "delivery_days_max");
  if (deliveryMinRaw === "") unknownFields.push("delivery_days_min");
  if (deliveryMaxRaw === "") unknownFields.push("delivery_days_max");
  const deliveryMin = deliveryMinRaw === ""
    ? 0
    : integerValue(record, "delivery_days_min", rowIssues, { required: true, nullable: false });
  const deliveryMax = deliveryMaxRaw === ""
    ? deliveryMin
    : integerValue(record, "delivery_days_max", rowIssues, { required: true, nullable: false });
  if (deliveryMin > deliveryMax) {
    rowIssues.push(
      issue("error", record.__row, "delivery_days_max", "최소 배송일 이상이어야 합니다.")
    );
  }

  const installationService = enumValue(
    record,
    "installation_service",
    rowIssues,
    ["none", "paid", "included", "unknown"],
    { fallback: "unknown" }
  );
  const selfAssembly = enumValue(
    record,
    "self_assembly",
    rowIssues,
    ["easy", "medium", "hard", "not_possible"]
  );
  let assemblyServiceAvailable = booleanValue(
    record,
    "assembly_service_available",
    rowIssues,
    unknownFields
  );
  const assemblyUnknown = unknownFields.includes("assembly_service_available");
  if (
    assemblyUnknown &&
    (selfAssembly === "not_possible" || ["paid", "included"].includes(installationService))
  ) {
    assemblyServiceAvailable = true;
  } else if (
    !assemblyUnknown &&
    !assemblyServiceAvailable &&
    (selfAssembly === "not_possible" || ["paid", "included"].includes(installationService))
  ) {
    rowIssues.push(
      issue("error", record.__row, "assembly_service_available", "설치 조건과 모순됩니다.")
    );
  }

  const risks = listValue(record, "review_risks");
  for (const risk of risks) {
    if (!REVIEW_RISKS.has(risk)) {
      rowIssues.push(issue("error", record.__row, "review_risks", `알 수 없는 리스크: ${risk}`));
    }
  }
  const reviewRiskCounts = riskCountsValue(record, rowIssues);
  const reviewSampleCount = integerValue(
    record,
    "review_sample_count",
    rowIssues,
    { min: 0, nullable: false, fallback: 0 }
  );
  if (reviewSampleCount > 10) {
    rowIssues.push(
      issue("error", record.__row, "review_sample_count", "상품별 리뷰 표본은 최대 10개입니다.")
    );
  }
  const reviewRecheckedCount = integerValue(
    record,
    "review_rechecked_count",
    rowIssues,
    { min: 0, nullable: false, fallback: 0 }
  );
  const reviewVerifiedAt = optionalDateValue(record, "review_verified_at", rowIssues);
  const commercialVerifiedAt = dateValue(record, "commercial_verified_at", rowIssues);
  const specVerifiedAt = dateValue(record, "spec_verified_at", rowIssues);
  const storageTypeRaw = raw(record, "storage_type");
  if (storageTypeRaw === "") unknownFields.push("storage_type");
  const assemblyPeopleRaw = raw(record, "assembly_people");
  if (assemblyPeopleRaw === "") unknownFields.push("assembly_people");

  const product = {
    internal_key: internalKey ?? "invalid",
    name: textValue(record, "name", rowIssues, { required: true, fallback: "invalid" }) ?? "invalid",
    seller_name: textValue(record, "seller_name", rowIssues, { required: true, fallback: "invalid" }) ?? "invalid",
    offer_id: textValue(record, "offer_id", rowIssues, { required: true, fallback: "invalid" }) ?? "invalid",
    variant_key: textValue(record, "variant_key", rowIssues, { required: true, fallback: "default" }) ?? "default",
    option_name: textValue(record, "option_name", rowIssues, { required: true, fallback: "SS" }) ?? "SS",
    seller_url: sellerUrl ?? "https://invalid.invalid",
    source_url: sourceUrl ?? "https://invalid.invalid",
    availability: enumValue(
      record,
      "availability",
      rowIssues,
      ["in_stock", "out_of_stock", "preorder", "unknown"],
      { required: true, fallback: "unknown" }
    ),
    price: integerValue(record, "price", rowIssues, { required: true, nullable: false }),
    shipping_fee: shippingFee,
    shipping_fee_confidence: shippingConfidence,
    unknown_fields: [...new Set(unknownFields)],
    installation_service: installationService,
    installation_fee: integerValue(record, "installation_fee", rowIssues),
    mattress_included: booleanValue(record, "mattress_included", rowIssues, unknownFields),
    mattress_price: integerValue(record, "mattress_price", rowIssues),
    delivery_days_min: deliveryMin,
    delivery_days_max: deliveryMax,
    scheduled_delivery: booleanValue(record, "scheduled_delivery", rowIssues, unknownFields),
    width_cm: decimalValue(record, "width_cm", rowIssues),
    length_cm: decimalValue(record, "length_cm", rowIssues),
    height_cm: decimalValue(record, "height_cm", rowIssues),
    bed_size: textValue(record, "bed_size", rowIssues, { required: true, fallback: "SS" }) ?? "SS",
    material: textValue(record, "material", rowIssues),
    storage_type: enumValue(
      record,
      "storage_type",
      rowIssues,
      ["lift_up", "drawer", "legs_open", "closed_base", "none"],
      { fallback: "none" }
    ),
    under_bed_clearance_cm: decimalValue(record, "under_bed_clearance_cm", rowIssues, { min: 0 }),
    has_outlet: booleanValue(record, "has_outlet", rowIssues, unknownFields),
    has_headboard: booleanValue(record, "has_headboard", rowIssues, unknownFields),
    colors: listValue(record, "colors"),
    storage_capacity: enumValue(record, "storage_capacity", rowIssues, ["large", "medium", "small", "none"]),
    dust_blocking: enumValue(record, "dust_blocking", rowIssues, ["high", "medium", "low"]),
    cleaning_ease: enumValue(record, "cleaning_ease", rowIssues, ["easy", "medium", "hard"]),
    robot_vacuum_fit: enumValue(record, "robot_vacuum_fit", rowIssues, ["ok", "check_height", "no"]),
    carry_difficulty: enumValue(record, "carry_difficulty", rowIssues, ["easy", "medium", "hard"]),
    carry_service_available: booleanValue(record, "carry_service_available", rowIssues, unknownFields),
    self_assembly: selfAssembly,
    assembly_service_available: assemblyServiceAvailable,
    assembly_people: integerValue(record, "assembly_people", rowIssues, {
      min: 1,
      nullable: false,
      fallback: 1,
    }),
    assembly_tools: textValue(record, "assembly_tools", rowIssues),
    disassembly_ease: enumValue(record, "disassembly_ease", rowIssues, ["easy", "medium", "hard"]),
    review_risks: risks.filter((risk) => REVIEW_RISKS.has(risk)),
    return_policy_summary: textValue(record, "return_policy_summary", rowIssues),
    damage_process_summary: textValue(record, "damage_process_summary", rowIssues),
    warranty_summary: textValue(record, "warranty_summary", rowIssues),
    review_sample_count: reviewSampleCount,
    review_risk_counts: reviewRiskCounts,
    review_verified_at: reviewVerifiedAt,
    review_rechecked_count: reviewRecheckedCount,
    recommended_for: textValue(record, "recommended_for", rowIssues),
    not_recommended_for: textValue(record, "not_recommended_for", rowIssues),
    data_confidence: enumValue(record, "data_confidence", rowIssues, ["confirmed", "estimated"], {
      required: true,
      fallback: "estimated",
    }),
    source_note: textValue(record, "source_note", rowIssues),
    last_verified_at: commercialVerifiedAt,
    commercial_verified_at: commercialVerifiedAt,
    spec_verified_at: specVerifiedAt,
    status: enumValue(record, "status", rowIssues, ["public", "hidden", "sold_out", "needs_check"], {
      required: true,
      fallback: "hidden",
    }),
    image_url: urlValue(record, "image_url", rowIssues),
  };
  product.unknown_fields = [...new Set(unknownFields)];

  const verifiedBy =
    textValue(record, "verified_by", rowIssues, { required: true, fallback: "unknown" }) ??
    "unknown";
  const catalogEvidence = {
    field_group: "catalog",
    field_names: EVIDENCE_FIELD_NAMES,
    source_url: product.source_url,
    observed_value: product,
    confidence: enumValue(
      record,
      "evidence_confidence",
      rowIssues,
      ["confirmed", "estimated", "unknown"],
      { required: true, fallback: "unknown" }
    ),
    verified_at: commercialVerifiedAt,
    verified_by: verifiedBy,
    notes: textValue(record, "evidence_notes", rowIssues),
  };

  const groupDefinitions = [
    {
      group: "commercial",
      sourceField: "commercial_source_url",
      confidenceField: "commercial_confidence",
      verifiedAt: commercialVerifiedAt,
      fields: ["price", "shipping_fee", "availability"],
    },
    {
      group: "delivery",
      sourceField: "delivery_source_url",
      confidenceField: "delivery_confidence",
      verifiedAt: commercialVerifiedAt,
      fields: ["delivery_days_min", "delivery_days_max", "scheduled_delivery", "installation_fee"],
    },
    {
      group: "spec",
      sourceField: "spec_source_url",
      confidenceField: "spec_confidence",
      verifiedAt: specVerifiedAt,
      fields: ["width_cm", "length_cm", "height_cm", "storage_type", "assembly_people"],
    },
    {
      group: "policy",
      sourceField: "policy_source_url",
      confidenceField: "policy_confidence",
      verifiedAt: specVerifiedAt,
      fields: ["return_policy_summary", "damage_process_summary", "warranty_summary"],
    },
    {
      group: "review",
      sourceField: "review_source_url",
      confidenceField: "review_confidence",
      verifiedAt: reviewVerifiedAt ?? specVerifiedAt,
      fields: ["review_sample_count", "review_risk_counts", "review_verified_at", "review_rechecked_count"],
    },
  ];
  const groupedEvidence = groupDefinitions.flatMap((definition) => {
    const source = urlValue(record, definition.sourceField, rowIssues);
    if (!source) return [];
    return [
      {
        field_group: definition.group,
        field_names: definition.fields,
        source_url: source,
        observed_value: Object.fromEntries(
          definition.fields.map((field) => [field, product[field] ?? null])
        ),
        confidence: enumValue(
          record,
          definition.confidenceField,
          rowIssues,
          ["confirmed", "estimated", "unknown"],
          { required: true, fallback: "unknown" }
        ),
        verified_at: definition.verifiedAt,
        verified_by: verifiedBy,
        notes: textValue(record, "evidence_notes", rowIssues),
      },
    ];
  });
  const evidence = [catalogEvidence, ...groupedEvidence];

  validatePublicRow(record, product, evidence, asOf, rowIssues, warnings);
  errors.push(...rowIssues);
  return { rowNumber: record.__row, product, evidence };
}

export function parseCatalogCsv(csv, { sourceName = "catalog.csv" } = {}) {
  let records;
  try {
    records = parse(csv, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: false,
    });
  } catch (error) {
    throw new Error(`${sourceName}: CSV 파싱 실패: ${error.message}`);
  }
  if (records.length === 0) throw new Error(`${sourceName}: 헤더가 없습니다.`);
  const header = records[0].map((value) => String(value).trim());
  const duplicateHeaders = header.filter((value, index) => header.indexOf(value) !== index);
  const missing = CATALOG_COLUMNS.filter((column) => !header.includes(column));
  const allowedColumns = new Set([...CATALOG_COLUMNS, ...OPTIONAL_CATALOG_COLUMNS]);
  const unknown = header.filter((column) => !allowedColumns.has(column));
  if (duplicateHeaders.length || missing.length || unknown.length) {
    const details = [
      duplicateHeaders.length ? `중복: ${[...new Set(duplicateHeaders)].join(", ")}` : "",
      missing.length ? `누락: ${missing.join(", ")}` : "",
      unknown.length ? `알 수 없음: ${unknown.join(", ")}` : "",
    ].filter(Boolean);
    throw new Error(`${sourceName}: CSV 헤더 오류 (${details.join("; ")})`);
  }
  return records.slice(1).map((values, index) => ({
    ...Object.fromEntries(header.map((column, columnIndex) => [column, values[columnIndex] ?? ""])),
    __row: index + 2,
  }));
}

export function todayInSeoul(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function validateCatalogRecords(records, { asOf = todayInSeoul() } = {}) {
  const errors = [];
  const warnings = [];
  if (records.length === 0) {
    errors.push(issue("error", null, "catalog", "상품 행이 하나 이상 필요합니다."));
  }
  const rows = records.map((record) => normalizeRow(record, asOf, errors, warnings));

  const internalKeys = new Map();
  const offers = new Map();
  for (const row of rows) {
    const { product } = row;
    const priorInternal = internalKeys.get(product.internal_key);
    if (priorInternal) {
      errors.push(
        issue("error", row.rowNumber, "internal_key", `${priorInternal}행과 중복입니다.`)
      );
    } else internalKeys.set(product.internal_key, row.rowNumber);

    const offerKey = [product.seller_name, product.offer_id, product.variant_key].join("\u0000");
    const priorOffer = offers.get(offerKey);
    if (priorOffer) {
      errors.push(
        issue("error", row.rowNumber, "variant_key", `${priorOffer}행과 판매 옵션이 중복입니다.`)
      );
    } else offers.set(offerKey, row.rowNumber);
  }

  const publicRows = rows.filter(({ product }) => product.status === "public");
  const sellers = new Set(publicRows.map(({ product }) => product.seller_name));
  const storageTypes = new Set(publicRows.map(({ product }) => product.storage_type));
  const priceBuckets = new Set(
    publicRows.map(({ product }) =>
      product.price < 100_000
        ? "under_100k"
        : product.price < 200_000
          ? "100k_200k"
          : product.price < 300_000
            ? "200k_300k"
            : "over_300k"
    )
  );
  const deliveryBuckets = new Set(
    publicRows.map(({ product }) =>
      product.delivery_days_max <= 7
        ? "within_7d"
        : product.delivery_days_max <= 14
          ? "within_14d"
          : product.delivery_days_max <= 30
            ? "within_30d"
            : "over_30d"
    )
  );
  const shippingBuckets = new Set(
    publicRows.map(({ product }) =>
      product.shipping_fee_confidence !== "confirmed"
        ? "unknown"
        : product.shipping_fee === 0
          ? "free"
          : "paid"
    )
  );
  if (publicRows.length > 0 && publicRows.length < 30) {
    warnings.push(issue("warning", null, "status", `공개 후보가 ${publicRows.length}개입니다(목표 30개).`));
  }
  if (publicRows.length > 0 && sellers.size < 6) {
    warnings.push(issue("warning", null, "seller_name", `공개 판매처가 ${sellers.size}곳입니다(목표 6곳).`));
  }
  if (publicRows.length > 0 && storageTypes.size < 3) {
    warnings.push(issue("warning", null, "storage_type", "공개 후보의 수납 방식 분포가 3종 미만입니다."));
  }
  if (publicRows.length > 0 && priceBuckets.size < 3) {
    warnings.push(issue("warning", null, "price", "공개 후보의 가격 구간이 3개 미만입니다."));
  }
  if (publicRows.length > 0 && deliveryBuckets.size < 3) {
    warnings.push(issue("warning", null, "delivery_days_max", "공개 후보의 배송 구간이 3개 미만입니다."));
  }
  if (publicRows.length > 0 && shippingBuckets.size < 2) {
    warnings.push(issue("warning", null, "shipping_fee", "공개 후보의 배송비 구간이 편중됐습니다."));
  }

  return {
    asOf,
    rows,
    errors,
    warnings,
    stats: {
      total: rows.length,
      public: publicRows.length,
      sellers: sellers.size,
      storageTypes: storageTypes.size,
      priceBuckets: priceBuckets.size,
      deliveryBuckets: deliveryBuckets.size,
      shippingBuckets: shippingBuckets.size,
    },
  };
}

export async function readAndValidateCatalog(file, options = {}) {
  const absolutePath = path.resolve(process.cwd(), file);
  const csv = await readFile(absolutePath, "utf8");
  const records = parseCatalogCsv(csv, { sourceName: file });
  return { file: absolutePath, ...validateCatalogRecords(records, options) };
}

export function formatIssue(item) {
  const location = item.row ? `${item.row}행 ${item.field}` : item.field;
  return `${item.severity === "error" ? "ERROR" : "WARN"} ${location}: ${item.message}`;
}

export function printValidation(result) {
  for (const item of result.errors) console.error(formatIssue(item));
  for (const item of result.warnings) console.warn(formatIssue(item));
  const {
    total,
    public: publicCount,
    sellers,
    storageTypes,
    priceBuckets,
    deliveryBuckets,
    shippingBuckets,
  } = result.stats;
  console.log(
    `Catalog ${total} rows (${publicCount} public), ${sellers} public sellers, ` +
      `${storageTypes} storage types, ${priceBuckets} price buckets, ` +
      `${deliveryBuckets} delivery buckets, ${shippingBuckets} shipping buckets; as-of ${result.asOf}.`
  );
}

export function loadCatalogEnvironment() {
  loadEnvConfig(process.cwd());
}

export function createCatalogClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) are required."
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function comparableProduct(product) {
  return {
    ...Object.fromEntries(
      PRODUCT_WRITE_FIELDS.map((field) => [field, product[field] ?? null])
    ),
    evidence: product.evidence ?? [],
  };
}

export function hashCatalog(products) {
  const canonical = products
    .map(comparableProduct)
    .sort((left, right) => left.internal_key.localeCompare(right.internal_key));
  return createHash("sha256").update(stableStringify(canonical)).digest("hex");
}

export function validateReleaseProducts(
  products,
  { asOf = todayInSeoul(), minProducts = 30, minSellers = 6, allowPartial = false } = {}
) {
  const errors = [];
  const warnings = [];
  if (!allowPartial && products.length < minProducts) {
    errors.push(`릴리스에는 최소 ${minProducts}개 상품이 필요합니다(현재 ${products.length}개).`);
  }
  const sellers = new Set(products.map((product) => product.seller_name));
  if (!allowPartial && sellers.size < minSellers) {
    errors.push(`릴리스에는 최소 ${minSellers}개 판매처가 필요합니다(현재 ${sellers.size}곳).`);
  }
  const internalKeys = new Set();
  const storageTypes = new Set(products.map((product) => product.storage_type));
  const priceBuckets = new Set(
    products.map((product) =>
      product.price < 100_000
        ? "under_100k"
        : product.price < 200_000
          ? "100k_200k"
          : product.price < 300_000
            ? "200k_300k"
            : "over_300k"
    )
  );
  const deliveryBuckets = new Set(
    products.map((product) =>
      product.delivery_days_max <= 7
        ? "within_7d"
        : product.delivery_days_max <= 14
          ? "within_14d"
          : product.delivery_days_max <= 30
            ? "within_30d"
            : "over_30d"
    )
  );
  for (const product of products) {
    const label = product.internal_key ?? product.id ?? "unknown";
    if (internalKeys.has(label)) errors.push(`${label}: internal_key가 중복입니다.`);
    internalKeys.add(label);
    if (product.status !== "public") errors.push(`${label}: status가 public이 아닙니다.`);
    if (product.availability !== "in_stock") errors.push(`${label}: 재고가 in_stock이 아닙니다.`);
    if (product.bed_size !== "SS") errors.push(`${label}: 현재 MVP 릴리스는 SS 규격만 허용합니다.`);
    if (!isRealHttpsUrl(product.seller_url) || !isRealHttpsUrl(product.source_url)) {
      errors.push(`${label}: 실제 HTTPS 판매/출처 URL이 필요합니다.`);
    }
    for (const [field, limit] of [
      ["commercial_verified_at", 7],
      ["spec_verified_at", 30],
    ]) {
      const age = ageInDays(product[field], asOf);
      if (age === null || age < 0 || age > limit) {
        errors.push(`${label}: ${field}는 기준일 ${asOf}부터 ${limit}일 이내여야 합니다.`);
      }
    }
    if (product.unknown_fields?.includes("delivery_days_min") || product.unknown_fields?.includes("delivery_days_max")) {
      errors.push(`${label}: 배송기간을 확인해야 합니다.`);
    }
    if (product.unknown_fields?.includes("storage_type") || product.unknown_fields?.includes("assembly_people")) {
      errors.push(`${label}: 수납 방식과 조립 인원을 확인해야 합니다.`);
    }
    if (product.width_cm === null || product.length_cm === null) {
      errors.push(`${label}: 가로·세로 규격을 확인해야 합니다.`);
    }
    for (const field of [
      "return_policy_summary",
      "damage_process_summary",
      "warranty_summary",
    ]) {
      if (!product[field]?.trim()) errors.push(`${label}: ${field} 확인이 필요합니다.`);
    }
    if (
      !Number.isInteger(product.review_sample_count) ||
      product.review_sample_count < 1 ||
      product.review_sample_count > 10
    ) {
      errors.push(`${label}: 리뷰 표본은 1~10개여야 합니다.`);
    }
    const requiredRechecks = Math.ceil((product.review_sample_count ?? 0) * 0.2);
    if ((product.review_rechecked_count ?? 0) < requiredRechecks) {
      errors.push(`${label}: 리뷰 표본 20% 이상을 재검수해야 합니다.`);
    }
    const reviewAge = ageInDays(product.review_verified_at, asOf);
    if (reviewAge === null || reviewAge < 0 || reviewAge > 30) {
      errors.push(`${label}: review_verified_at은 기준일 ${asOf}부터 30일 이내여야 합니다.`);
    }
    const repeatedRisks = Object.entries(product.review_risk_counts ?? {})
      .filter(([, count]) => count >= 2)
      .map(([risk]) => risk)
      .sort();
    if (JSON.stringify(repeatedRisks) !== JSON.stringify([...(product.review_risks ?? [])].sort())) {
      errors.push(`${label}: 반복 리뷰 위험(2건 이상) 집계가 일치하지 않습니다.`);
    }
    if (product.shipping_fee_confidence === "unknown") {
      warnings.push(`${label}: 배송비 미확인 상태로 릴리스됩니다.`);
    }
  }
  if (storageTypes.size < 3) warnings.push("수납 방식 분포가 3종 미만입니다.");
  if (priceBuckets.size < 3) warnings.push("가격 구간 분포가 3개 미만입니다.");
  if (deliveryBuckets.size < 3) warnings.push("배송 기간 분포가 3개 미만입니다.");
  return {
    errors,
    warnings,
    sellers: sellers.size,
    storageTypes: storageTypes.size,
    priceBuckets: priceBuckets.size,
    deliveryBuckets: deliveryBuckets.size,
  };
}

export function parseCommonArgs(argv) {
  const options = {
    file: DEFAULT_CATALOG_FILE,
    asOf: undefined,
    dryRun: false,
    retireMissing: false,
    allowPartial: false,
    version: undefined,
    warningApproval: undefined,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--file") options.file = argv[++index];
    else if (argument === "--as-of") options.asOf = argv[++index];
    else if (argument === "--version") options.version = argv[++index];
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--retire-missing") options.retireMissing = true;
    else if (argument === "--allow-partial") options.allowPartial = true;
    else if (argument === "--approve-warnings") options.warningApproval = argv[++index];
    else if (argument === "--help" || argument === "-h") options.help = true;
    else if (!argument.startsWith("-") && options.file === DEFAULT_CATALOG_FILE) options.file = argument;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.file) throw new Error("--file requires a path.");
  if (options.asOf && !/^\d{4}-\d{2}-\d{2}$/.test(options.asOf)) {
    throw new Error("--as-of must use YYYY-MM-DD.");
  }
  return options;
}
