import { beforeEach, describe, expect, it, vi } from "vitest";

const { supabaseAdminMock } = vi.hoisted(() => ({
  supabaseAdminMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: vi.fn(() => true),
  supabaseAdmin: supabaseAdminMock,
}));

import {
  createEmptyProductFormValues,
  hasRequiredPublicSource,
  isProductVerificationStale,
  parseProductFormData,
  parseProductStatus,
  PublicProductSourceRequiredError,
  todayInSeoul,
  updateAdminProductStatus,
  verificationAgeInDays,
} from "@/lib/admin-products";
import { SEED_PRODUCTS } from "@/lib/seed-data";

const PRODUCT_WRITE_FIELDS = [
  "name",
  "seller_name",
  "seller_url",
  "image_url",
  "price",
  "shipping_fee",
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
  "last_verified_at",
  "status",
] as const;

function validProductForm(): FormData {
  const form = new FormData();
  const fields: Record<string, string> = {
    name: "테스트 슈퍼싱글 침대",
    seller_name: "테스트 판매처",
    seller_url: "https://example.com/product/1",
    image_url: "https://example.com/product/1.jpg",
    price: "159000",
    shipping_fee: "30000",
    installation_service: "none",
    installation_fee: "",
    mattress_price: "89000",
    delivery_days_min: "3",
    delivery_days_max: "7",
    width_cm: "115",
    length_cm: "205",
    height_cm: "32",
    bed_size: "SS",
    material: "PB + LPM",
    storage_type: "drawer",
    under_bed_clearance_cm: "",
    colors: "화이트, 오크\n화이트",
    storage_capacity: "medium",
    dust_blocking: "high",
    cleaning_ease: "easy",
    robot_vacuum_fit: "no",
    carry_difficulty: "medium",
    self_assembly: "medium",
    assembly_people: "2",
    assembly_tools: "십자드라이버",
    disassembly_ease: "medium",
    recommended_for: "수납이 필요한 사람",
    not_recommended_for: "혼자 운반해야 하는 사람",
    data_confidence: "confirmed",
    source_note: "공식몰 상세페이지 · 제주 배송 별도 문의",
    last_verified_at: "2026-07-11",
    status: "hidden",
  };
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  form.append("review_risks", "assembly_hard");
  form.append("review_risks", "delivery_delay");
  return form;
}

beforeEach(() => {
  supabaseAdminMock.mockReset();
});

describe("parseProductFormData", () => {
  it("모든 상품 필드를 타입에 맞게 정규화한다", () => {
    const form = validProductForm();
    form.set("scheduled_delivery", "on");
    form.set("has_headboard", "on");
    form.set("carry_service_available", "on");

    const result = parseProductFormData(form);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toMatchObject({
      name: "테스트 슈퍼싱글 침대",
      seller_url: "https://example.com/product/1",
      price: 159000,
      installation_fee: null,
      scheduled_delivery: true,
      has_headboard: true,
      carry_service_available: true,
      colors: ["화이트", "오크"],
      review_risks: ["assembly_hard", "delivery_delay"],
      status: "hidden",
    });
    expect(Object.keys(result.data).sort()).toEqual([...PRODUCT_WRITE_FIELDS].sort());
  });

  it("필수값, URL, 정수, enum, 날짜를 서버에서 거부한다", () => {
    const form = validProductForm();
    form.set("name", "");
    form.set("seller_url", "javascript:alert(1)");
    form.set("price", "12.5");
    form.set("storage_type", "unknown-storage");
    form.set("last_verified_at", "2026-02-31");

    const result = parseProductFormData(form);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors).toMatchObject({
      name: expect.any(String),
      seller_url: expect.any(String),
      price: expect.any(String),
      storage_type: expect.any(String),
      last_verified_at: expect.any(String),
    });
  });

  it("비용 필드에 Postgres int 최대값을 허용한다", () => {
    const form = validProductForm();
    for (const field of [
      "price",
      "shipping_fee",
      "installation_fee",
      "mattress_price",
    ]) {
      form.set(field, "2147483647");
    }

    const result = parseProductFormData(form, "2026-07-11");

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toMatchObject({
      price: 2_147_483_647,
      shipping_fee: 2_147_483_647,
      installation_fee: 2_147_483_647,
      mattress_price: 2_147_483_647,
    });
  });

  it("비용 필드가 Postgres int 최대값을 넘으면 거부한다", () => {
    const form = validProductForm();
    for (const field of [
      "price",
      "shipping_fee",
      "installation_fee",
      "mattress_price",
    ]) {
      form.set(field, "2147483648");
    }

    const result = parseProductFormData(form, "2026-07-11");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors).toMatchObject({
      price: expect.stringContaining("2147483647 이하"),
      shipping_fee: expect.stringContaining("2147483647 이하"),
      installation_fee: expect.stringContaining("2147483647 이하"),
      mattress_price: expect.stringContaining("2147483647 이하"),
    });
  });

  it("최대 배송일이 최소 배송일보다 빠르면 거부한다", () => {
    const form = validProductForm();
    form.set("delivery_days_min", "14");
    form.set("delivery_days_max", "7");

    const result = parseProductFormData(form);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.delivery_days_max).toContain("최소 배송일 이상");
    }
  });

  it("직접 조립 불가 상품에 조립 서비스가 없으면 거부한다", () => {
    const form = validProductForm();
    form.set("self_assembly", "not_possible");

    const result = parseProductFormData(form);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.assembly_service_available).toContain("조립 서비스");
    }
  });

  it("유료·포함 설치 상품에 조립 서비스가 없으면 거부한다", () => {
    const form = validProductForm();
    form.set("installation_service", "paid");

    const result = parseProductFormData(form);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.assembly_service_available).toContain("유료·포함");
    }
  });

  it("허용 목록 밖 리뷰 리스크를 거부한다", () => {
    const form = validProductForm();
    form.append("review_risks", "made_up_risk");

    const result = parseProductFormData(form);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.review_risks).toBeTruthy();
    }
  });

  it("선택 문자열의 길이 제한도 success 반환 전에 검증한다", () => {
    const form = validProductForm();
    form.set("source_note", "가".repeat(1001));

    const result = parseProductFormData(form);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.source_note).toContain("1000자");
    }
  });

  it("공개 상품은 공백이 아닌 정보 출처가 있어야 한다", () => {
    const form = validProductForm();
    form.set("status", "public");
    form.set("source_note", " \n\t ");

    const result = parseProductFormData(form);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.source_note).toContain("공개 상품");
    }
  });

  it("비공개 초안은 정보 출처를 비워 둘 수 있다", () => {
    const form = validProductForm();
    form.set("status", "hidden");
    form.delete("source_note");

    const result = parseProductFormData(form);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.source_note).toBeNull();
    }
  });

  it("서울 오늘보다 미래인 마지막 확인일을 거부한다", () => {
    const form = validProductForm();
    form.set("last_verified_at", "2026-07-12");

    const result = parseProductFormData(form, "2026-07-11");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.last_verified_at).toContain("오늘 이후");
    }
  });
});

describe("상품 관리자 보조 함수", () => {
  it("공개 상태에만 공백이 아닌 출처를 요구한다", () => {
    expect(hasRequiredPublicSource("public", null)).toBe(false);
    expect(hasRequiredPublicSource("public", "   ")).toBe(false);
    expect(hasRequiredPublicSource("public", "공식몰 상세페이지")).toBe(true);
    expect(hasRequiredPublicSource("hidden", null)).toBe(true);
    expect(hasRequiredPublicSource("sold_out", null)).toBe(true);
    expect(hasRequiredPublicSource("needs_check", null)).toBe(true);
  });

  it("기본 공개 시드 10개는 모두 정보 출처가 있다", () => {
    const publicSeeds = SEED_PRODUCTS.filter(({ status }) => status === "public");

    expect(publicSeeds).toHaveLength(10);
    expect(
      publicSeeds.every(({ source_note }) =>
        hasRequiredPublicSource("public", source_note)
      )
    ).toBe(true);
  });

  it("14일째는 최신이고 14일을 넘으면 오래된 정보다", () => {
    expect(isProductVerificationStale("2026-06-27", "2026-07-11")).toBe(false);
    expect(isProductVerificationStale("2026-06-26", "2026-07-11")).toBe(true);
    expect(verificationAgeInDays("2026-06-26", "2026-07-11")).toBe(15);
  });

  it("잘못된 확인일은 안전하게 오래된 정보로 취급한다", () => {
    expect(isProductVerificationStale("not-a-date", "2026-07-11")).toBe(true);
    expect(verificationAgeInDays("not-a-date", "2026-07-11")).toBeNull();
  });

  it("서울 날짜와 안전한 신규 기본값을 만든다", () => {
    const now = new Date("2026-07-10T15:30:00.000Z");
    expect(todayInSeoul(now)).toBe("2026-07-11");
    expect(createEmptyProductFormValues("2026-07-11")).toMatchObject({
      status: "hidden",
      bed_size: "SS",
      last_verified_at: "2026-07-11",
      assembly_people: 1,
    });
  });

  it("상품 상태 whitelist만 허용한다", () => {
    expect(parseProductStatus("public")).toBe("public");
    expect(parseProductStatus("archived")).toBeNull();
    expect(parseProductStatus(null)).toBeNull();
  });
});

describe("updateAdminProductStatus", () => {
  it("출처가 없는 상품은 공개 상태 업데이트 전에 거부한다", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { source_note: "  " },
      error: null,
    });
    const select = vi.fn(() => ({
      eq: vi.fn(() => ({ maybeSingle })),
    }));
    const from = vi.fn(() => ({ select }));
    supabaseAdminMock.mockReturnValue({ from });

    await expect(
      updateAdminProductStatus("00000000-0000-4000-8000-000000000001", "public")
    ).rejects.toBeInstanceOf(PublicProductSourceRequiredError);
    expect(select).toHaveBeenCalledWith("source_note");
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("비공개 전환은 출처 조회 없이 허용한다", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "00000000-0000-4000-8000-000000000001" },
      error: null,
    });
    const select = vi.fn(() => ({ maybeSingle }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    supabaseAdminMock.mockReturnValue({ from });

    await expect(
      updateAdminProductStatus("00000000-0000-4000-8000-000000000001", "hidden")
    ).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledWith({ status: "hidden" });
    expect(from).toHaveBeenCalledTimes(1);
  });
});
