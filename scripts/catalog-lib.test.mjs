import assert from "node:assert/strict";
import test from "node:test";
import {
  CATALOG_COLUMNS,
  OPTIONAL_CATALOG_COLUMNS,
  hashCatalog,
  parseCatalogCsv,
  validateCatalogRecords,
  validateReleaseProducts,
} from "./catalog-lib.mjs";

function validDraft(overrides = {}) {
  return {
    internal_key: "store:bed-1:ss",
    name: "실상품 초안",
    seller_name: "공식 판매처",
    offer_id: "bed-1",
    variant_key: "ss-white",
    option_name: "90x200 화이트 프레임",
    seller_url: "https://shop.real-store.test/products/bed-1",
    source_url: "https://shop.real-store.test/products/bed-1",
    availability: "unknown",
    price: "199000",
    shipping_fee: "",
    shipping_fee_confidence: "unknown",
    installation_service: "unknown",
    installation_fee: "",
    mattress_included: "",
    mattress_price: "",
    delivery_days_min: "",
    delivery_days_max: "",
    scheduled_delivery: "",
    width_cm: "119.6",
    length_cm: "200.5",
    height_cm: "30.25",
    bed_size: "S-90x200",
    material: "스틸",
    storage_type: "",
    under_bed_clearance_cm: "12.5",
    has_outlet: "",
    has_headboard: "",
    colors: "화이트|블랙",
    storage_capacity: "",
    dust_blocking: "",
    cleaning_ease: "",
    robot_vacuum_fit: "",
    carry_difficulty: "",
    carry_service_available: "",
    self_assembly: "",
    assembly_service_available: "",
    assembly_people: "",
    assembly_tools: "",
    disassembly_ease: "",
    review_risks: "",
    recommended_for: "",
    not_recommended_for: "",
    data_confidence: "estimated",
    source_note: "",
    commercial_verified_at: "2026-07-12",
    spec_verified_at: "2026-07-12",
    status: "hidden",
    verified_by: "researcher-1",
    evidence_confidence: "unknown",
    evidence_notes: "옵션 확인 전",
    image_url: "",
    ...overrides,
  };
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function makeCsv(rows, columns = CATALOG_COLUMNS) {
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
  ].join("\n");
}

function validPublic(overrides = {}) {
  const source = "https://shop.real-store.test/products/bed-1";
  return validDraft({
    option_name: "SS 화이트 프레임",
    availability: "in_stock",
    shipping_fee: "0",
    shipping_fee_confidence: "confirmed",
    delivery_days_min: "3",
    delivery_days_max: "7",
    storage_type: "drawer",
    assembly_people: "1",
    bed_size: "SS",
    data_confidence: "confirmed",
    source_note: "공식 상세페이지와 정책·리뷰 표본 확인",
    status: "public",
    evidence_confidence: "confirmed",
    return_policy_summary: "단순 변심 반품비 확인",
    damage_process_summary: "수령 직후 사진 접수",
    warranty_summary: "1년 품질보증",
    review_sample_count: "5",
    review_risk_counts: '{"squeak":2}',
    review_risks: "squeak",
    review_verified_at: "2026-07-12",
    review_rechecked_count: "1",
    commercial_source_url: source,
    delivery_source_url: source,
    spec_source_url: source,
    policy_source_url: source,
    review_source_url: source,
    commercial_confidence: "confirmed",
    delivery_confidence: "confirmed",
    spec_confidence: "confirmed",
    policy_confidence: "confirmed",
    review_confidence: "confirmed",
    ...overrides,
  });
}

test("hidden drafts preserve unknown values and decimal dimensions", () => {
  const records = parseCatalogCsv(makeCsv([validDraft()]));
  const result = validateCatalogRecords(records, { asOf: "2026-07-12" });

  assert.deepEqual(result.errors, []);
  assert.equal(result.rows[0].product.width_cm, 119.6);
  assert.equal(result.rows[0].product.bed_size, "S-90x200");
  assert.equal(result.rows[0].product.shipping_fee, 0);
  assert.equal(result.rows[0].product.shipping_fee_confidence, "unknown");
  assert.ok(result.rows[0].product.unknown_fields.includes("storage_type"));
  assert.ok(result.rows[0].product.unknown_fields.includes("assembly_people"));
  assert.ok(result.rows[0].product.unknown_fields.includes("scheduled_delivery"));
});

test("public rows reject placeholder URLs, unknown core fields, and stale evidence", () => {
  const records = parseCatalogCsv(
    makeCsv([
      validDraft({
        status: "public",
        availability: "in_stock",
        seller_url: "https://example.com/bed",
        source_url: "https://example.com/bed",
        commercial_verified_at: "2026-07-01",
        evidence_confidence: "confirmed",
        source_note: "공식 상세 페이지",
      }),
    ])
  );
  const result = validateCatalogRecords(records, { asOf: "2026-07-12" });

  assert.ok(result.errors.some(({ field }) => field === "seller_url"));
  assert.ok(result.errors.some(({ field }) => field === "commercial_verified_at"));
  assert.ok(result.errors.some(({ field }) => field === "delivery_days_min"));
  assert.ok(result.errors.some(({ field }) => field === "storage_type"));
});

test("duplicate internal and seller offer-variant keys are rejected", () => {
  const records = parseCatalogCsv(makeCsv([validDraft(), validDraft()]));
  const result = validateCatalogRecords(records, { asOf: "2026-07-12" });

  assert.ok(result.errors.some(({ field }) => field === "internal_key"));
  assert.ok(result.errors.some(({ field }) => field === "variant_key"));
});

test("public rows require SS scope, policy evidence, and reviewed risk counts", () => {
  const columns = [...CATALOG_COLUMNS, ...OPTIONAL_CATALOG_COLUMNS];
  const valid = validateCatalogRecords(parseCatalogCsv(makeCsv([validPublic()], columns)), {
    asOf: "2026-07-12",
  });
  assert.deepEqual(valid.errors, []);

  const invalid = validateCatalogRecords(
    parseCatalogCsv(
      makeCsv(
        [
          validPublic({
            bed_size: "S-90x200",
            review_risk_counts: '{"squeak":1}',
            review_rechecked_count: "0",
          }),
        ],
        columns
      )
    ),
    { asOf: "2026-07-12" }
  );
  assert.ok(invalid.errors.some(({ field }) => field === "bed_size"));
  assert.ok(invalid.errors.some(({ field }) => field === "review_risks"));
  assert.ok(invalid.errors.some(({ field }) => field === "review_rechecked_count"));
});

test("public rows allow an officially confirmed zero-review product", () => {
  const columns = [...CATALOG_COLUMNS, ...OPTIONAL_CATALOG_COLUMNS];
  const valid = validateCatalogRecords(
    parseCatalogCsv(
      makeCsv(
        [
          validPublic({
            review_sample_count: "0",
            review_risk_counts: "{}",
            review_risks: "",
            review_rechecked_count: "0",
          }),
        ],
        columns
      )
    ),
    { asOf: "2026-07-12" }
  );
  assert.deepEqual(valid.errors, []);

  const impossibleRisk = validateCatalogRecords(
    parseCatalogCsv(
      makeCsv(
        [
          validPublic({
            review_sample_count: "0",
            review_risk_counts: '{"smell":1}',
            review_risks: "",
            review_rechecked_count: "0",
          }),
        ],
        columns
      )
    ),
    { asOf: "2026-07-12" }
  );
  assert.ok(impossibleRisk.errors.some(({ field }) => field === "review_risk_counts"));
});

test("catalog hash is stable across object key and product order", () => {
  const first = { internal_key: "a", name: "A", price: 1 };
  const second = { price: 2, name: "B", internal_key: "b" };

  assert.equal(
    hashCatalog([first, second]),
    hashCatalog([
      { name: "B", internal_key: "b", price: 2 },
      { price: 1, internal_key: "a", name: "A" },
    ])
  );
});

test("release validation defaults to 30 products and 6 sellers", () => {
  const product = {
    id: "00000000-0000-4000-8000-000000000001",
    internal_key: "one",
    seller_name: "seller",
    seller_url: "https://shop.real-store.test/one",
    source_url: "https://shop.real-store.test/one",
    status: "public",
    availability: "in_stock",
    commercial_verified_at: "2026-07-12",
    spec_verified_at: "2026-07-12",
    unknown_fields: [],
    width_cm: 110,
    length_cm: 200,
    bed_size: "SS",
    price: 199000,
    storage_type: "drawer",
    delivery_days_max: 7,
    shipping_fee_confidence: "confirmed",
    return_policy_summary: "단순 변심 반품비 확인",
    damage_process_summary: "수령 직후 사진 접수",
    warranty_summary: "1년 품질보증",
    review_sample_count: 5,
    review_risk_counts: {},
    review_risks: [],
    review_verified_at: "2026-07-12",
    review_rechecked_count: 1,
  };

  assert.ok(
    validateReleaseProducts([product], { asOf: "2026-07-12" }).errors.some((message) =>
      message.includes("최소 30개")
    )
  );
  assert.deepEqual(
    validateReleaseProducts([product], {
      asOf: "2026-07-12",
      allowPartial: true,
    }).errors,
    []
  );
});
