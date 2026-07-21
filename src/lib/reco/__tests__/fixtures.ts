import type { Product } from "../types";

export { SEED_PRODUCTS } from "@/lib/seed-data";

let seq = 0;

/** 테스트용 상품 생성 — 기본값은 필터를 널널하게 통과하는 무난한 다리형 침대 */
export function makeProduct(overrides: Partial<Product> = {}): Product {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-9${String(seq).padStart(11, "0")}`,
    name: `테스트 침대 ${seq}`,
    seller_name: "테스트몰",
    seller_url: "https://example.com/test",
    image_url: null,
    price: 150000,
    shipping_fee: 0,
    shipping_fee_confidence: "confirmed",
    installation_service: "none",
    installation_fee: null,
    mattress_included: false,
    mattress_price: 90000,
    delivery_days_min: 3,
    delivery_days_max: 5,
    scheduled_delivery: false,
    width_cm: 112,
    length_cm: 203,
    height_cm: 30,
    bed_size: "SS",
    material: "PB",
    storage_type: "legs_open",
    under_bed_clearance_cm: 25,
    has_outlet: false,
    has_headboard: false,
    colors: ["화이트"],
    storage_capacity: "small",
    dust_blocking: "low",
    cleaning_ease: "easy",
    robot_vacuum_fit: "ok",
    carry_difficulty: "easy",
    carry_service_available: false,
    self_assembly: "easy",
    assembly_service_available: false,
    assembly_people: 1,
    assembly_tools: "육각렌치 동봉",
    disassembly_ease: "easy",
    review_risks: [],
    recommended_for: null,
    not_recommended_for: null,
    data_confidence: "confirmed",
    source_note: "테스트",
    last_verified_at: "2026-07-08",
    status: "public",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}
