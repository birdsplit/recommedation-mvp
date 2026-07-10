import { describe, expect, it } from "vitest";
import type {
  Answers,
  Budget,
  CarryAnswer,
  DeliveryAnswer,
  PriceBasis,
  StorageAnswer,
} from "../types";
import {
  DEFAULT_ANSWERS,
  hasAnswers,
  parseAnswers,
  answersQuery,
} from "../answers";
import { computeCost } from "../cost";
import { checkBudget, checkCarry, checkDelivery, checkStorage } from "../filter";
import { riskPenalty } from "../score";
import { evaluateProduct, recommend } from "../engine";
import { buildRelaxSuggestions } from "../relax";
import { makeProduct, SEED_PRODUCTS } from "./fixtures";

const answers = (overrides: Partial<Answers> = {}): Answers => ({
  ...DEFAULT_ANSWERS,
  ...overrides,
});

describe("cost — 총비용 계산", () => {
  it("기본: 상품가 + 배송비", () => {
    const p = makeProduct({ price: 100000, shipping_fee: 30000 });
    const cost = computeCost(p, answers());
    expect(cost.knownTotal).toBe(130000);
    expect(cost.unknownParts).toEqual([]);
  });

  it("조립 서비스가 필요한 사용자는 설치비가 총비용에 포함된다", () => {
    const p = makeProduct({
      price: 100000,
      shipping_fee: 0,
      installation_service: "paid",
      installation_fee: 40000,
      assembly_service_available: true,
    });
    expect(computeCost(p, answers({ carry: "carry_only" })).knownTotal).toBe(
      140000
    );
    // 직접 조립하는 사용자에게는 설치비 미포함
    expect(computeCost(p, answers({ carry: "both_ok" })).knownTotal).toBe(
      100000
    );
  });

  it("설치비 미확인이면 숫자를 지어내지 않고 unknownParts로 알린다", () => {
    const p = makeProduct({
      price: 100000,
      installation_service: "paid",
      installation_fee: null,
      assembly_service_available: true,
    });
    const cost = computeCost(p, answers({ carry: "carry_only" }));
    expect(cost.knownTotal).toBe(100000);
    expect(cost.unknownParts).toContain("설치·조립비");
  });

  it("매트리스 희망 + 미포함이면 별도가 합산, 가격 미확인이면 unknownParts", () => {
    const withPrice = makeProduct({ price: 100000, mattress_price: 90000 });
    expect(
      computeCost(withPrice, answers({ wantsMattress: true })).knownTotal
    ).toBe(190000);

    const noPrice = makeProduct({ price: 100000, mattress_price: null });
    const cost = computeCost(noPrice, answers({ wantsMattress: true }));
    expect(cost.knownTotal).toBe(100000);
    expect(cost.unknownParts).toContain("매트리스 가격");

    const included = makeProduct({ price: 100000, mattress_included: true });
    expect(
      computeCost(included, answers({ wantsMattress: true })).knownTotal
    ).toBe(100000);
  });
});

describe("filter — 예산 (priceBasis 양방향)", () => {
  const p = makeProduct({ price: 190000, shipping_fee: 30000 });

  it("총비용 기준: 상품가+배송비로 판정", () => {
    const a = answers({ budget: 200000, priceBasis: "total" });
    expect(checkBudget(p, a, computeCost(p, a)).pass).toBe(false);
  });

  it("상품가만 기준: 배송비 무시", () => {
    const a = answers({ budget: 200000, priceBasis: "product_only" });
    expect(checkBudget(p, a, computeCost(p, a)).pass).toBe(true);
  });

  it("예산 상관없음이면 통과", () => {
    const a = answers({ budget: null });
    expect(checkBudget(p, a, computeCost(p, a)).pass).toBe(true);
  });
});

describe("filter — 배송 경계값 (7/14/30 포함)", () => {
  const cases: Array<[DeliveryAnswer, number, boolean]> = [
    ["this_week", 7, true],
    ["this_week", 8, false],
    ["two_weeks", 14, true],
    ["two_weeks", 15, false],
    ["one_month", 30, true],
    ["one_month", 31, false],
  ];
  it.each(cases)("%s에 최대 %i일 배송 → %s", (delivery, maxDays, expected) => {
    const p = makeProduct({
      delivery_days_min: 1,
      delivery_days_max: maxDays,
    });
    expect(checkDelivery(p, answers({ delivery })).pass).toBe(expected);
  });

  it("상관없음이면 항상 통과", () => {
    const p = makeProduct({ delivery_days_max: 60 });
    expect(checkDelivery(p, answers({ delivery: "any" })).pass).toBe(true);
  });
});

describe("filter — Q1 수납 매핑", () => {
  it("큰 짐 → 리프트업만", () => {
    expect(
      checkStorage(
        makeProduct({ storage_type: "lift_up" }),
        answers({ storage: "big_items" })
      ).pass
    ).toBe(true);
    expect(
      checkStorage(
        makeProduct({ storage_type: "drawer" }),
        answers({ storage: "big_items" })
      ).pass
    ).toBe(false);
  });

  it("서랍 → drawer만", () => {
    expect(
      checkStorage(
        makeProduct({ storage_type: "drawer" }),
        answers({ storage: "drawers" })
      ).pass
    ).toBe(true);
    expect(
      checkStorage(
        makeProduct({ storage_type: "lift_up" }),
        answers({ storage: "drawers" })
      ).pass
    ).toBe(false);
  });

  it("로봇청소기 → ok는 통과, check_height는 주의와 함께 통과, no는 제외", () => {
    expect(
      checkStorage(
        makeProduct({ robot_vacuum_fit: "ok" }),
        answers({ storage: "robot_vacuum" })
      ).pass
    ).toBe(true);
    const check = checkStorage(
      makeProduct({ robot_vacuum_fit: "check_height", under_bed_clearance_cm: 12 }),
      answers({ storage: "robot_vacuum" })
    );
    expect(check.pass).toBe(true);
    expect(check.note).toContain("12cm");
    expect(
      checkStorage(
        makeProduct({ robot_vacuum_fit: "no" }),
        answers({ storage: "robot_vacuum" })
      ).pass
    ).toBe(false);
  });

  it("먼지 차단 → dust_blocking high 또는 막힌 구조", () => {
    expect(
      checkStorage(
        makeProduct({ storage_type: "closed_base", dust_blocking: "high" }),
        answers({ storage: "closed" })
      ).pass
    ).toBe(true);
    expect(
      checkStorage(
        makeProduct({ storage_type: "drawer", dust_blocking: "medium" }),
        answers({ storage: "closed" })
      ).pass
    ).toBe(true); // 구조상 막힘
    expect(
      checkStorage(
        makeProduct({ storage_type: "legs_open", dust_blocking: "low" }),
        answers({ storage: "closed" })
      ).pass
    ).toBe(false);
  });
});

describe("filter — Q2 운반·조립 요건", () => {
  const heavyNoServices = makeProduct({
    carry_difficulty: "hard",
    carry_service_available: false,
    self_assembly: "hard",
    assembly_service_available: false,
  });
  const fullService = makeProduct({
    carry_difficulty: "hard",
    carry_service_available: true,
    self_assembly: "not_possible",
    assembly_service_available: true,
  });
  const lightEasy = makeProduct({
    carry_difficulty: "easy",
    carry_service_available: false,
    self_assembly: "easy",
    assembly_service_available: false,
  });

  it("둘 다 직접 가능 / 친구 도움 → 모두 통과", () => {
    for (const carry of ["both_ok", "friend_help"] as CarryAnswer[]) {
      expect(checkCarry(heavyNoServices, answers({ carry })).pass).toBe(true);
    }
  });

  it("기사 설치 전용인데 조립 서비스가 없으면 직접 가능/친구 도움도 실패", () => {
    const impossibleWithoutService = makeProduct({
      self_assembly: "not_possible",
      assembly_service_available: false,
    });
    for (const carry of ["both_ok", "friend_help"] as CarryAnswer[]) {
      expect(
        checkCarry(impossibleWithoutService, answers({ carry })).pass
      ).toBe(false);
    }
    expect(checkCarry(fullService, answers({ carry: "both_ok" })).pass).toBe(
      true
    );
  });

  it("조립 가능 여부가 미확인이고 서비스도 없으면 직접 조립 답변은 실패", () => {
    const unknownAssembly = makeProduct({
      self_assembly: null,
      assembly_service_available: false,
      carry_service_available: true,
    });
    for (const carry of [
      "both_ok",
      "friend_help",
      "assembly_only",
    ] as CarryAnswer[]) {
      expect(checkCarry(unknownAssembly, answers({ carry })).pass).toBe(false);
    }
  });

  it("운반 어려움 → 운반 서비스 또는 가벼운 제품만", () => {
    const a = answers({ carry: "assembly_only" });
    expect(checkCarry(heavyNoServices, a).pass).toBe(false);
    expect(checkCarry(fullService, a).pass).toBe(true);
    expect(checkCarry(lightEasy, a).pass).toBe(true);
  });

  it("조립 어려움 → 조립 서비스 또는 아주 쉬운 조립만", () => {
    const a = answers({ carry: "carry_only" });
    expect(checkCarry(heavyNoServices, a).pass).toBe(false);
    expect(checkCarry(fullService, a).pass).toBe(true);
    expect(checkCarry(lightEasy, a).pass).toBe(true);
  });

  it("둘 다 서비스 필요 → 운반+조립 서비스 모두 있어야 함", () => {
    const a = answers({ carry: "need_both" });
    expect(checkCarry(heavyNoServices, a).pass).toBe(false);
    expect(checkCarry(lightEasy, a).pass).toBe(false);
    expect(checkCarry(fullService, a).pass).toBe(true);
  });
});

describe("score — 능력에 따른 리스크 감점 완화", () => {
  const p = makeProduct({ review_risks: ["squeak"] });

  it("직접 조립 가능하면 삐걱임 감점이 절반", () => {
    expect(riskPenalty("squeak", p, answers({ carry: "both_ok" }))).toBe(1);
    expect(riskPenalty("squeak", p, answers({ carry: "carry_only" }))).toBe(2);
  });

  it("조립 서비스 사용자에겐 조립 난이도 리스크가 상쇄된다", () => {
    expect(riskPenalty("assembly_hard", p, answers({ carry: "need_both" }))).toBe(0);
    expect(
      riskPenalty("assembly_hard", p, answers({ carry: "both_ok" }))
    ).toBeGreaterThan(0);
  });

  it("배송 여유가 있으면 배송 지연 감점이 줄어든다", () => {
    expect(riskPenalty("delivery_delay", p, answers({ delivery: "any" }))).toBe(1);
    expect(
      riskPenalty("delivery_delay", p, answers({ delivery: "two_weeks" }))
    ).toBe(2);
  });

  it("같은 상품이라도 감당 능력이 있는 사용자에게 점수가 높다", () => {
    const squeaky = makeProduct({ review_risks: ["squeak", "wobble"] });
    const canFix = evaluateProduct(squeaky, answers({ carry: "both_ok" }));
    const cannotFix = evaluateProduct(
      makeProduct({
        ...squeaky,
        assembly_service_available: true,
        carry_service_available: true,
      }),
      answers({ carry: "need_both" })
    );
    expect(canFix.score).toBeGreaterThan(cannotFix.score);
  });
});

describe("engine — 추천 결과", () => {
  it("후보는 최대 3개, 비추천 티어는 절대 포함되지 않는다", () => {
    const result = recommend(SEED_PRODUCTS, answers());
    expect(result.candidates.length).toBeLessThanOrEqual(3);
    for (const c of result.candidates) {
      expect(c.tier).not.toBe("not_fit");
      expect(c.checks.every((ch) => ch.pass)).toBe(true);
    }
  });

  it("필수조건 미충족 상품은 후보에 없다 (예산 20만 총비용 기준)", () => {
    const a = answers({ budget: 200000, priceBasis: "total" });
    const result = recommend(SEED_PRODUCTS, a);
    for (const c of result.candidates) {
      expect(c.cost.knownTotal).toBeLessThanOrEqual(200000);
    }
  });

  it("public이 아닌 상품은 검토 대상에서 제외된다", () => {
    const products = [
      makeProduct({ status: "sold_out" }),
      makeProduct({ status: "hidden" }),
      makeProduct({ status: "public" }),
    ];
    const result = recommend(products, answers());
    expect(result.totalReviewed).toBe(1);
    expect(result.candidates.length).toBe(1);
  });

  it("정렬은 결정적이다 (동일 입력 → 동일 순서)", () => {
    const a = answers({ storage: "drawers" });
    const first = recommend(SEED_PRODUCTS, a).candidates.map(
      (c) => c.product.name
    );
    const second = recommend([...SEED_PRODUCTS].reverse(), a).candidates.map(
      (c) => c.product.name
    );
    expect(first).toEqual(second);
  });

  it("티어 순 → 점수 순 → 총비용 낮은 순으로 정렬된다", () => {
    const result = recommend(SEED_PRODUCTS, answers());
    const rank = { great: 2, conditional: 1, not_fit: 0 };
    for (let i = 1; i < result.candidates.length; i++) {
      const prev = result.candidates[i - 1];
      const cur = result.candidates[i];
      expect(rank[prev.tier]).toBeGreaterThanOrEqual(rank[cur.tier]);
      if (prev.tier === cur.tier) {
        expect(prev.score).toBeGreaterThanOrEqual(cur.score);
      }
    }
  });

  it("상세 판단용 evaluateProduct는 불충족 상품에 비추천 티어를 준다", () => {
    const expensive = makeProduct({ price: 500000 });
    const rec = evaluateProduct(
      expensive,
      answers({ budget: 200000, priceBasis: "total" })
    );
    expect(rec.tier).toBe("not_fit");
    expect(rec.finalJudgment).toContain("맞지 않는");
  });
});

describe("engine — 빈 결과와 조건 완화 (§7.5)", () => {
  it("큰 짐 수납 + 일주일 안 배송 → 빈 결과 (의도된 시드 조합)", () => {
    const a = answers({ storage: "big_items", delivery: "this_week" });
    const result = recommend(SEED_PRODUCTS, a);
    expect(result.candidates).toEqual([]);
    expect(result.relaxSuggestions.length).toBeGreaterThan(0);
  });

  it("완화 제안의 후보 증가 수가 정확하다", () => {
    const a = answers({ storage: "big_items", delivery: "this_week" });
    const suggestions = buildRelaxSuggestions(SEED_PRODUCTS, a, 0);
    // 배송을 한 달 안으로 늘리면 리프트업 2개(스텔라 21일, 밀로 30일)가 잡힌다
    const delivery = suggestions.find((s) => s.label.includes("배송일"));
    expect(delivery).toBeDefined();
    expect(delivery!.label).toContain("한 달 안");
    expect(delivery!.gained).toBe(2);
    // 수납 조건을 빼면 일주일 안 배송 가능한 상품들이 잡힌다
    const storage = suggestions.find((s) => s.label.includes("수납"));
    expect(storage).toBeDefined();
    expect(storage!.gained).toBeGreaterThan(0);
  });

  it("후보가 3개 미만이면 완화 제안이 함께 온다", () => {
    const a = answers({ budget: 100000, priceBasis: "total" });
    const result = recommend(SEED_PRODUCTS, a); // 브리즈(89,000)만 통과
    expect(result.candidates.length).toBe(1);
    expect(result.relaxSuggestions.length).toBeGreaterThan(0);
    const budget = result.relaxSuggestions.find((s) =>
      s.label.includes("예산")
    );
    expect(budget).toBeDefined();
  });

  it("후보가 3개 채워지면 완화 제안은 없다", () => {
    const result = recommend(SEED_PRODUCTS, answers());
    expect(result.candidates.length).toBe(3);
    expect(result.relaxSuggestions).toEqual([]);
  });
});

describe("reasons — 전체 답변 조합에서 근거가 항상 생성된다", () => {
  const storages: StorageAnswer[] = [
    "big_items",
    "drawers",
    "robot_vacuum",
    "closed",
    "any",
  ];
  const carries: CarryAnswer[] = [
    "both_ok",
    "assembly_only",
    "carry_only",
    "need_both",
    "friend_help",
  ];
  const budgets: Budget[] = [100000, 200000, 300000, null];
  const bases: PriceBasis[] = ["product_only", "total"];
  const deliveries: DeliveryAnswer[] = [
    "this_week",
    "two_weeks",
    "one_month",
    "any",
  ];
  const mattresses: Array<boolean | null> = [true, false, null];

  it("모든 조합 × 시드 10개: 이유 2 + 주의 ≥1 + 최종 한 문장", () => {
    for (const storage of storages)
      for (const carry of carries)
        for (const budget of budgets)
          for (const priceBasis of bases)
            for (const delivery of deliveries)
              for (const wantsMattress of mattresses) {
                const a: Answers = {
                  storage,
                  carry,
                  budget,
                  priceBasis,
                  delivery,
                  wantsMattress,
                };
                for (const p of SEED_PRODUCTS) {
                  const rec = evaluateProduct(p, a);
                  expect(rec.fitReasons).toHaveLength(2);
                  expect(rec.cautions.length).toBeGreaterThanOrEqual(1);
                  expect(rec.finalJudgment.length).toBeGreaterThan(5);
                  expect(rec.passCount).toBeLessThanOrEqual(rec.totalChecks);
                }
                // 후보에 비추천이 섞이지 않는지도 전 조합에서 확인
                const result = recommend(SEED_PRODUCTS, a);
                expect(result.candidates.length).toBeLessThanOrEqual(3);
                for (const c of result.candidates) {
                  expect(c.tier).not.toBe("not_fit");
                }
              }
  });
});

describe("answers — URL 인코딩 왕복", () => {
  it("encode → parse 왕복이 동일하다", () => {
    const original: Answers = {
      storage: "drawers",
      carry: "assembly_only",
      budget: 200000,
      priceBasis: "total",
      delivery: "two_weeks",
      wantsMattress: true,
    };
    const query = answersQuery(original);
    const parsed = parseAnswers(
      Object.fromEntries(new URLSearchParams(query))
    );
    expect(parsed).toEqual(original);
  });

  it("빈 쿼리는 기본값으로 파싱된다", () => {
    expect(parseAnswers({})).toEqual(DEFAULT_ANSWERS);
  });

  it("프로토타입 상속 키(toString 등)는 기본값으로 폴백된다 — 크래시 방지", () => {
    const malicious = parseAnswers({
      s: "toString",
      c: "constructor",
      d: "valueOf",
      b: "hasOwnProperty",
    });
    expect(malicious).toEqual(DEFAULT_ANSWERS);
    // 엔진 전체가 조작된 쿼리에서도 정상 동작해야 한다
    expect(() => recommend(SEED_PRODUCTS, malicious)).not.toThrow();
    // hasAnswers도 유효한 답변 코드만 인정
    expect(hasAnswers({ s: "toString", c: "both" })).toBe(false);
    expect(hasAnswers({ s: "drawer", c: "both" })).toBe(true);
  });
});

describe("리뷰 발견 회귀 — 완화 고지·설치비·문구", () => {
  it("운반 서비스 없이 '가벼움'으로 통과하면 충족표 note와 주의로 고지된다", () => {
    const light = makeProduct({
      carry_difficulty: "easy",
      carry_service_available: false,
    });
    const rec = evaluateProduct(light, answers({ carry: "assembly_only" }));
    const carryCheck = rec.checks.find((c) => c.key === "carry")!;
    expect(carryCheck.pass).toBe(true);
    expect(carryCheck.note).toContain("운반 서비스 없음");
    expect(rec.cautions.some((c) => c.core === "운반 방법")).toBe(true);
  });

  it("설치 서비스가 아예 없는(none) 상품은 '설치비 판매처 확인' 안내를 만들지 않는다", () => {
    const noService = makeProduct({
      installation_service: "none",
      self_assembly: "easy",
    });
    const cost = computeCost(noService, answers({ carry: "carry_only" }));
    expect(cost.unknownParts).toEqual([]);
    const rec = evaluateProduct(noService, answers({ carry: "carry_only" }));
    expect(rec.cautions.some((c) => c.core === "직접 조립")).toBe(true);
  });

  it("먼지 차단이 '보통'인 막힌 구조에는 완전 밀폐 문구를 쓰지 않는다", () => {
    const medium = makeProduct({
      storage_type: "drawer",
      dust_blocking: "medium",
    });
    const rec = evaluateProduct(medium, answers({ storage: "closed" }));
    const dustReason = rec.fitReasons.find((r) => r.core === "먼지 차단");
    if (dustReason) {
      expect(dustReason.text).not.toContain("쌓이지 않아요");
    }
    const storageCheck = rec.checks.find((c) => c.key === "storage")!;
    expect(storageCheck.pass).toBe(true);
    expect(storageCheck.note).toContain("완전 밀폐는 아니에요");
  });

  it("전체 조합에서 '확인 확인' 중복·'가장' 최상급·조사 오류 문구가 없다", () => {
    const storages = ["big_items", "drawers", "robot_vacuum", "closed", "any"] as const;
    const carries = ["both_ok", "assembly_only", "carry_only", "need_both", "friend_help"] as const;
    for (const storage of storages)
      for (const carry of carries)
        for (const wantsMattress of [true, false, null]) {
          const a = answers({ storage, carry, wantsMattress });
          for (const p of [
            ...SEED_PRODUCTS,
            makeProduct({ mattress_price: null }),
            makeProduct({ installation_service: "paid", installation_fee: null, assembly_service_available: true }),
          ]) {
            const rec = evaluateProduct(p, a);
            expect(rec.finalJudgment).not.toContain("확인 확인");
            expect(rec.finalJudgment).not.toContain("가장 무난");
            for (const c of rec.cautions) {
              expect(c.text).not.toContain("가격는");
            }
          }
        }
  });
});
