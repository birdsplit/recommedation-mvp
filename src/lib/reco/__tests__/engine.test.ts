import { describe, expect, it } from "vitest";
import type {
  AssemblyAnswer,
  AssistanceAnswer,
  Answers,
  Budget,
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
import {
  checkAssembly,
  checkBudget,
  checkCarry,
  checkDelivery,
  checkSize,
  checkStorage,
  runChecks,
} from "../filter";
import { preferencePoints, riskPenalty } from "../score";
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
    expect(computeCost(p, answers({ assembly: "service" })).knownTotal).toBe(
      140000
    );
    // 직접 조립하는 사용자에게는 설치비 미포함
    expect(computeCost(p, answers({ assembly: "self" })).knownTotal).toBe(
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
    const cost = computeCost(p, answers({ assembly: "service" }));
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

  it("배송비 신뢰도가 unknown이면 총비용의 미확인 항목으로 남긴다", () => {
    const p = makeProduct({
      shipping_fee: 0,
      shipping_fee_confidence: "unknown",
    });
    const cost = computeCost(p, answers());
    expect(cost.knownTotal).toBe(p.price);
    expect(cost.unknownParts).toContain("배송비");
  });

  it("배송비가 estimated여도 확인된 총비용에 합산하지 않는다", () => {
    const p = makeProduct({
      price: 100000,
      shipping_fee: 30000,
      shipping_fee_confidence: "estimated",
    });
    const cost = computeCost(p, answers());
    expect(cost.knownTotal).toBe(100000);
    expect(cost.unknownParts).toContain("배송비");
  });

  it("레거시 매트리스 포함값이 미확인이면 별도 가격을 지어내지 않는다", () => {
    const p = makeProduct({
      mattress_included: false,
      mattress_price: 90000,
      unknown_fields: ["mattress_included"],
    });
    const cost = computeCost(p, answers({ wantsMattress: true }));
    expect(cost.knownTotal).toBe(p.price + p.shipping_fee);
    expect(cost.unknownParts).toContain("매트리스 포함 여부·가격");
  });
});

describe("filter — 예산 (priceBasis 양방향)", () => {
  const p = makeProduct({ price: 190000, shipping_fee: 30000 });

  it("총비용 기준: 상품가+배송비로 판정", () => {
    const a = answers({ budget: 200000, priceBasis: "total" });
    expect(checkBudget(p, a, computeCost(p, a)).status).toBe("not_met");
  });

  it("상품가만 기준: 배송비 무시", () => {
    const a = answers({ budget: 200000, priceBasis: "product_only" });
    expect(checkBudget(p, a, computeCost(p, a)).status).toBe("met");
  });

  it("예산 상관없음이면 필수조건 계산에서 제외된다", () => {
    const a = answers({ budget: null });
    const result = checkBudget(p, a, computeCost(p, a));
    expect(result.status).toBe("unknown");
    expect(result.required).toBe(false);
    expect(
      runChecks(p, a, computeCost(p, a)).some((item) => item.key === "budget")
    ).toBe(false);
  });

  it("총비용 일부가 미확인이면 알려진 금액이 예산 안이어도 unknown이다", () => {
    const product = makeProduct({
      price: 190000,
      shipping_fee: 0,
      shipping_fee_confidence: "unknown",
    });
    const a = answers({ budget: 200000, priceBasis: "total" });
    expect(checkBudget(product, a, computeCost(product, a)).status).toBe(
      "unknown"
    );
  });

  it.each([
    {
      label: "설치비",
      product: {
        installation_service: "paid" as const,
        installation_fee: null,
        assembly_service_available: true,
      },
      answer: { assembly: "service" as const },
    },
    {
      label: "매트리스 가격",
      product: { mattress_included: false, mattress_price: null },
      answer: { wantsMattress: true },
    },
  ])("$label 미확인은 총비용 예산 판정을 unknown으로 만든다", ({ product, answer }) => {
    const p = makeProduct({ price: 100000, ...product });
    const a = answers({
      budget: 200000,
      priceBasis: "total",
      ...answer,
    });
    expect(checkBudget(p, a, computeCost(p, a)).status).toBe("unknown");
  });
});

describe("filter — 배송 경계값 (7/14/30 포함)", () => {
  const cases: Array<[DeliveryAnswer, number, "met" | "not_met"]> = [
    ["this_week", 7, "met"],
    ["this_week", 8, "not_met"],
    ["two_weeks", 14, "met"],
    ["two_weeks", 15, "not_met"],
    ["one_month", 30, "met"],
    ["one_month", 31, "not_met"],
  ];
  it.each(cases)("%s에 최대 %i일 배송 → %s", (delivery, maxDays, expected) => {
    const p = makeProduct({
      delivery_days_min: 1,
      delivery_days_max: maxDays,
    });
    expect(checkDelivery(p, answers({ delivery })).status).toBe(expected);
  });

  it("상관없음이면 필수조건 계산에서 제외된다", () => {
    const p = makeProduct({ delivery_days_max: 60 });
    const a = answers({ delivery: "any" });
    const result = checkDelivery(p, a);
    expect(result.status).toBe("unknown");
    expect(result.required).toBe(false);
    expect(
      runChecks(p, a, computeCost(p, a)).some(
        (item) => item.key === "delivery"
      )
    ).toBe(false);
  });

  it("레거시 숫자가 있어도 배송일이 미확인 필드면 unknown이다", () => {
    const p = makeProduct({
      delivery_days_min: 0,
      delivery_days_max: 0,
      unknown_fields: ["delivery_days_min", "delivery_days_max"],
    });
    expect(checkDelivery(p, answers({ delivery: "this_week" })).status).toBe(
      "unknown"
    );
  });
});

describe("filter — Q1 수납 매핑", () => {
  it("큰 짐 → 리프트업만", () => {
    expect(
      checkStorage(
        makeProduct({ storage_type: "lift_up" }),
        answers({ storage: "big_items" })
      ).status
    ).toBe("met");
    expect(
      checkStorage(
        makeProduct({ storage_type: "drawer" }),
        answers({ storage: "big_items" })
      ).status
    ).toBe("not_met");
  });

  it("서랍 → drawer만", () => {
    expect(
      checkStorage(
        makeProduct({ storage_type: "drawer" }),
        answers({ storage: "drawers" })
      ).status
    ).toBe("met");
    expect(
      checkStorage(
        makeProduct({ storage_type: "lift_up" }),
        answers({ storage: "drawers" })
      ).status
    ).toBe("not_met");
  });

  it("로봇청소기 → ok는 met, check_height는 unknown, no는 not_met", () => {
    expect(
      checkStorage(
        makeProduct({ robot_vacuum_fit: "ok" }),
        answers({ storage: "robot_vacuum" })
      ).status
    ).toBe("met");
    const check = checkStorage(
      makeProduct({ robot_vacuum_fit: "check_height", under_bed_clearance_cm: 12 }),
      answers({ storage: "robot_vacuum" })
    );
    expect(check.status).toBe("unknown");
    expect(check.note).toContain("12cm");
    expect(
      checkStorage(
        makeProduct({ robot_vacuum_fit: "no" }),
        answers({ storage: "robot_vacuum" })
      ).status
    ).toBe("not_met");
    expect(
      checkStorage(
        makeProduct({ robot_vacuum_fit: null }),
        answers({ storage: "robot_vacuum" })
      ).status
    ).toBe("unknown");
  });

  it("먼지 차단 → dust_blocking high 또는 막힌 구조", () => {
    expect(
      checkStorage(
        makeProduct({ storage_type: "closed_base", dust_blocking: "high" }),
        answers({ storage: "closed" })
      ).status
    ).toBe("met");
    expect(
      checkStorage(
        makeProduct({ storage_type: "drawer", dust_blocking: "medium" }),
        answers({ storage: "closed" })
      ).status
    ).toBe("met"); // 구조상 막힘
    expect(
      checkStorage(
        makeProduct({ storage_type: "legs_open", dust_blocking: "low" }),
        answers({ storage: "closed" })
      ).status
    ).toBe("not_met");
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

  it("혼자 옮기기 어려운 상품은 직접 운반에서 제외하고 친구 도움은 허용한다", () => {
    expect(checkCarry(heavyNoServices, answers({ carry: "self" })).status).toBe(
      "not_met"
    );
    expect(
      checkCarry(heavyNoServices, answers({ carry: "friend" })).status
    ).toBe("met");
    expect(
      checkCarry(heavyNoServices, answers({ carry: "service" })).status
    ).toBe("not_met");
    expect(checkCarry(fullService, answers({ carry: "service" })).status).toBe(
      "met"
    );
  });

  it("운반 난이도 정보가 없으면 직접/친구 운반 판정은 unknown", () => {
    const unknownCarry = makeProduct({ carry_difficulty: null });
    expect(checkCarry(unknownCarry, answers({ carry: "self" })).status).toBe(
      "unknown"
    );
  });

  it("기사 설치 전용 상품은 직접/친구 조립 조건에 맞지 않는다", () => {
    const impossibleWithoutService = makeProduct({
      self_assembly: "not_possible",
      assembly_service_available: false,
    });
    for (const assembly of ["self", "friend"] as AssemblyAnswer[]) {
      expect(
        checkAssembly(impossibleWithoutService, answers({ assembly })).status
      ).toBe("not_met");
    }
    expect(
      checkAssembly(fullService, answers({ assembly: "service" })).status
    ).toBe("met");
  });

  it("조립 가능 여부가 미확인이면 직접/친구 조립 판정은 unknown", () => {
    const unknownAssembly = makeProduct({
      self_assembly: null,
      assembly_service_available: false,
      carry_service_available: true,
    });
    for (const assembly of ["self", "friend"] as AssemblyAnswer[]) {
      expect(
        checkAssembly(unknownAssembly, answers({ assembly })).status
      ).toBe("unknown");
    }
  });

  it("혼자 조립과 친구 도움의 권장 인원을 구분한다", () => {
    const twoPeople = makeProduct({
      self_assembly: "medium",
      assembly_people: 2,
    });
    expect(
      checkAssembly(twoPeople, answers({ assembly: "self" })).status
    ).toBe("not_met");
    expect(
      checkAssembly(twoPeople, answers({ assembly: "friend" })).status
    ).toBe("met");

    const unknownPeople = makeProduct({
      self_assembly: "easy",
      unknown_fields: ["assembly_people"],
    });
    expect(
      checkAssembly(unknownPeople, answers({ assembly: "self" })).status
    ).toBe("unknown");
  });

  it("운반과 조립 서비스는 각각 충족해야 한다", () => {
    const a = answers({ carry: "service", assembly: "service" });
    const noServices = runChecks(
      heavyNoServices,
      a,
      computeCost(heavyNoServices, a)
    );
    expect(noServices.find((item) => item.key === "carry")?.status).toBe(
      "not_met"
    );
    expect(noServices.find((item) => item.key === "assembly")?.status).toBe(
      "not_met"
    );
    expect(checkCarry(fullService, a).status).toBe("met");
    expect(checkAssembly(fullService, a).status).toBe("met");
    expect(checkAssembly(lightEasy, a).status).toBe("not_met");
  });

  it("레거시 false라도 unknown_fields에 있으면 서비스 여부는 unknown이다", () => {
    const legacyUnknown = makeProduct({
      carry_service_available: false,
      assembly_service_available: false,
      unknown_fields: [
        "carry_service_available",
        "assembly_service_available",
      ],
    });
    const a = answers({ carry: "service", assembly: "service" });
    expect(checkCarry(legacyUnknown, a).status).toBe("unknown");
    expect(checkAssembly(legacyUnknown, a).status).toBe("unknown");
  });
});

describe("filter — 방 크기 안내", () => {
  it("방 크기를 묻지 않았으므로 자동 충족이 아니라 안내용 unknown이다", () => {
    const result = checkSize(makeProduct({ width_cm: 112, length_cm: 203 }));
    expect(result.status).toBe("unknown");
    expect(result.required).toBe(false);
    expect(result.note).toContain("실측");
  });
});

describe("score — 능력에 따른 리스크 감점 완화", () => {
  const p = makeProduct({ review_risks: ["squeak"] });

  it("직접 조립 가능하면 삐걱임 감점이 절반", () => {
    expect(riskPenalty("squeak", p, answers({ assembly: "self" }))).toBe(1);
    expect(riskPenalty("squeak", p, answers({ assembly: "service" }))).toBe(2);
  });

  it("조립 서비스 사용자에겐 조립 난이도 리스크가 상쇄된다", () => {
    expect(
      riskPenalty("assembly_hard", p, answers({ assembly: "service" }))
    ).toBe(0);
    expect(
      riskPenalty("assembly_hard", p, answers({ assembly: "self" }))
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
    const canFix = evaluateProduct(squeaky, answers({ assembly: "self" }));
    const cannotFix = evaluateProduct(
      makeProduct({
        ...squeaky,
        assembly_service_available: true,
        carry_service_available: true,
      }),
      answers({ carry: "service", assembly: "service" })
    );
    expect(canFix.score).toBeGreaterThan(cannotFix.score);
  });

  it("질문하지 않은 콘센트·헤드보드는 추천 점수에 반영하지 않는다", () => {
    const plain = makeProduct({ has_outlet: false, has_headboard: false });
    const extras = makeProduct({ has_outlet: true, has_headboard: true });
    const a = answers();
    expect(preferencePoints(extras, a, computeCost(extras, a))).toEqual(
      preferencePoints(plain, a, computeCost(plain, a))
    );
  });

  it("미확인 배송 숫자와 미확인 총비용으로 선호 가점을 만들지 않는다", () => {
    const p = makeProduct({
      shipping_fee_confidence: "unknown",
      delivery_days_min: 0,
      delivery_days_max: 0,
      scheduled_delivery: true,
      unknown_fields: ["delivery_days_min", "delivery_days_max"],
    });
    const a = answers({
      budget: 300000,
      priceBasis: "total",
      delivery: "this_week",
    });
    const keys = preferencePoints(p, a, computeCost(p, a)).map(
      (item) => item.key
    );
    expect(keys).not.toContain("delivery_margin");
    expect(keys).not.toContain("scheduled_delivery");
    expect(keys).not.toContain("budget_margin");
    expect(
      evaluateProduct(p, a).fitReasons.every(
        (reason) => !reason.text.includes("0~0일")
      )
    ).toBe(true);
  });
});

describe("engine — 추천 결과", () => {
  it("후보는 최대 3개, 비추천 티어는 절대 포함되지 않는다", () => {
    const result = recommend(SEED_PRODUCTS, answers());
    expect(result.candidates.length).toBeLessThanOrEqual(3);
    for (const c of result.candidates) {
      expect(c.tier).not.toBe("not_fit");
      expect(c.conditionStatus).not.toBe("not_met");
      expect(
        c.checks.every(
          (item) => !item.required || item.status !== "not_met"
        )
      ).toBe(true);
    }
  });

  it("확정 충족 후보를 먼저 채우고 unknown은 부족한 자리만 채운다", () => {
    const a = answers({ storage: "robot_vacuum" });
    const confirmed = makeProduct({
      name: "확정 후보",
      robot_vacuum_fit: "ok",
    });
    const unknown = makeProduct({
      name: "확인 필요 후보",
      robot_vacuum_fit: "check_height",
    });
    const rejected = makeProduct({
      name: "불충족 후보",
      robot_vacuum_fit: "no",
    });
    const result = recommend([unknown, rejected, confirmed], a);
    expect(result.candidates.map((item) => item.product.name)).toEqual([
      "확정 후보",
      "확인 필요 후보",
    ]);
    expect(result.candidates.map((item) => item.conditionStatus)).toEqual([
      "met",
      "unknown",
    ]);
    expect(result.candidates[1].tier).toBe("conditional");
  });

  it("확정 충족 후보가 3개면 unknown 후보를 노출하지 않는다", () => {
    const a = answers({ storage: "robot_vacuum" });
    const confirmed = [1, 2, 3].map((number) =>
      makeProduct({ name: `확정 ${number}`, robot_vacuum_fit: "ok" })
    );
    const unknown = makeProduct({
      name: "확인 필요",
      robot_vacuum_fit: "check_height",
    });
    const result = recommend([unknown, ...confirmed], a);
    expect(result.candidates).toHaveLength(3);
    expect(
      result.candidates.every((item) => item.conditionStatus === "met")
    ).toBe(true);
  });

  it("unknown 필수조건이 있으면 매우 적합 티어를 주지 않는다", () => {
    const rec = evaluateProduct(
      makeProduct({ robot_vacuum_fit: "check_height" }),
      answers({ storage: "robot_vacuum" })
    );
    expect(rec.conditionStatus).toBe("unknown");
    expect(rec.tier).toBe("conditional");
  });

  it("추정 데이터로 충족한 조건은 확정 충족이 아니라 unknown이다", () => {
    const rec = evaluateProduct(
      makeProduct({ data_confidence: "estimated" }),
      answers()
    );
    expect(rec.conditionStatus).toBe("unknown");
    expect(rec.tier).toBe("conditional");
    expect(
      rec.checks
        .filter((item) => item.required)
        .every((item) => item.status === "unknown")
    ).toBe(true);
  });

  it("추정 데이터로 계산한 불충족도 확정 탈락 대신 unknown이다", () => {
    const rec = evaluateProduct(
      makeProduct({
        data_confidence: "estimated",
        carry_difficulty: "hard",
        self_assembly: "hard",
      }),
      answers({ carry: "self", assembly: "self" })
    );
    expect(rec.conditionStatus).toBe("unknown");
    expect(
      rec.checks
        .filter((item) => item.required)
        .every((item) => item.status === "unknown")
    ).toBe(true);
  });

  it("예산·배송 미선택은 충족 개수에 포함하지 않는다", () => {
    const rec = evaluateProduct(
      makeProduct(),
      answers({ storage: "any", budget: null, delivery: "any" })
    );
    expect(rec.totalChecks).toBe(2); // 운반 + 조립
    expect(rec.passCount).toBe(2);
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

  it("점수 동률은 데이터 완성도 → 확인 총액 → 배송 → 상품명 순으로 푼다", () => {
    const a = answers();
    const complete = makeProduct({
      name: "완성도 높음",
      price: 200000,
      delivery_days_max: 20,
    });
    const incomplete = makeProduct({
      name: "완성도 낮음",
      price: 100000,
      delivery_days_max: 1,
      material: null,
      source_note: null,
    });
    expect(recommend([incomplete, complete], a).candidates[0].product.name).toBe(
      "완성도 높음"
    );

    const expensive = makeProduct({ name: "비쌈", price: 200000 });
    const cheap = makeProduct({ name: "저렴", price: 100000 });
    expect(recommend([expensive, cheap], a).candidates[0].product.name).toBe(
      "저렴"
    );

    const slow = makeProduct({
      name: "느림",
      price: 150000,
      delivery_days_max: 10,
    });
    const fast = makeProduct({
      name: "빠름",
      price: 150000,
      delivery_days_max: 3,
    });
    expect(recommend([slow, fast], a).candidates[0].product.name).toBe("빠름");

    const nameB = makeProduct({ name: "하늘" });
    const nameA = makeProduct({ name: "가람" });
    expect(recommend([nameB, nameA], a).candidates[0].product.name).toBe("가람");
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
  const confirmedSeed = SEED_PRODUCTS.map((product) => ({
    ...product,
    data_confidence: "confirmed" as const,
  }));

  it("큰 짐 수납 + 일주일 안 배송 → 빈 결과 (의도된 시드 조합)", () => {
    const a = answers({
      storage: "big_items",
      delivery: "this_week",
      carry: "service",
      assembly: "service",
    });
    const result = recommend(confirmedSeed, a);
    expect(result.candidates).toEqual([]);
    expect(result.relaxSuggestions.length).toBeGreaterThan(0);
  });

  it("완화 제안의 후보 증가 수가 정확하다", () => {
    const a = answers({
      storage: "big_items",
      delivery: "this_week",
      carry: "service",
      assembly: "service",
    });
    const suggestions = buildRelaxSuggestions(confirmedSeed, a, 0);
    // 배송을 한 달 안으로 늘리면 리프트업 2개(스텔라 21일, 밀로 30일)가 잡힌다
    const delivery = suggestions.find((s) => s.label.includes("배송일"));
    expect(delivery).toBeDefined();
    expect(delivery!.label).toContain("한 달 안");
    expect(delivery!.gained).toBe(2);
    // 수납 조건을 빼면 일주일 안 배송 가능한 상품들이 잡힌다
    const storageSuggestions = buildRelaxSuggestions(
      confirmedSeed,
      answers({ storage: "big_items", delivery: "this_week" }),
      0
    );
    const storage = storageSuggestions.find((s) => s.label.includes("수납"));
    expect(storage).toBeDefined();
    expect(storage!.gained).toBeGreaterThan(0);
  });

  it("후보가 3개 미만이면 완화 제안이 함께 온다", () => {
    const a = answers({ budget: 100000, priceBasis: "total" });
    const result = recommend(confirmedSeed, a); // 브리즈(89,000)만 통과
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
  const carries: AssistanceAnswer[] = ["self", "friend", "service"];
  const assemblies: AssemblyAnswer[] = ["self", "friend", "service"];
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
        for (const assembly of assemblies)
          for (const budget of budgets)
            for (const priceBasis of bases)
              for (const delivery of deliveries)
                for (const wantsMattress of mattresses) {
                  const a: Answers = {
                    storage,
                    carry,
                    assembly,
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
  }, 15_000);
});

describe("answers — URL 인코딩 왕복", () => {
  it("encode → parse 왕복이 동일하다", () => {
    const original: Answers = {
      storage: "drawers",
      carry: "service",
      assembly: "self",
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
    expect(new URLSearchParams(query).get("ca")).toBe("service");
    expect(new URLSearchParams(query).get("a")).toBe("self");
    expect(new URLSearchParams(query).has("c")).toBe(false);
  });

  it.each([
    ["both", "self", "self"],
    ["asm", "service", "self"],
    ["carry", "self", "service"],
    ["svc", "service", "service"],
    ["friend", "friend", "friend"],
  ] as const)("기존 c=%s 링크를 독립 답변으로 변환한다", (legacy, carry, assembly) => {
    const parsed = parseAnswers({ s: "drawer", c: legacy });
    expect(parsed.carry).toBe(carry);
    expect(parsed.assembly).toBe(assembly);
    expect(hasAnswers({ s: "drawer", c: legacy })).toBe(true);
  });

  it("빈 쿼리는 기본값으로 파싱된다", () => {
    expect(parseAnswers({})).toEqual(DEFAULT_ANSWERS);
  });

  it("프로토타입 상속 키(toString 등)는 기본값으로 폴백된다 — 크래시 방지", () => {
    const malicious = parseAnswers({
      s: "toString",
      c: "constructor",
      ca: "constructor",
      a: "toString",
      d: "valueOf",
      b: "hasOwnProperty",
    });
    expect(malicious).toEqual(DEFAULT_ANSWERS);
    // 엔진 전체가 조작된 쿼리에서도 정상 동작해야 한다
    expect(() => recommend(SEED_PRODUCTS, malicious)).not.toThrow();
    // hasAnswers도 유효한 답변 코드만 인정
    expect(hasAnswers({ s: "toString", c: "both" })).toBe(false);
    expect(hasAnswers({ s: "drawer", c: "both" })).toBe(true);
    expect(hasAnswers({ s: "drawer", ca: "self", a: "service" })).toBe(true);
    expect(hasAnswers({ s: "drawer", ca: "self" })).toBe(false);
  });
});

describe("리뷰 발견 회귀 — 완화 고지·설치비·문구", () => {
  it("운반 서비스가 필요할 때 서비스 없는 상품은 확실히 제외한다", () => {
    const light = makeProduct({
      carry_difficulty: "easy",
      carry_service_available: false,
    });
    const rec = evaluateProduct(light, answers({ carry: "service" }));
    const carryCheck = rec.checks.find((c) => c.key === "carry")!;
    expect(carryCheck.status).toBe("not_met");
    expect(carryCheck.note).toContain("서비스 없음");
    expect(rec.tier).toBe("not_fit");
  });

  it("설치 서비스가 아예 없는(none) 상품은 '설치비 판매처 확인' 안내를 만들지 않는다", () => {
    const noService = makeProduct({
      installation_service: "none",
      self_assembly: "easy",
    });
    const cost = computeCost(noService, answers({ assembly: "service" }));
    expect(cost.unknownParts).toEqual([]);
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
    expect(storageCheck.status).toBe("met");
    expect(storageCheck.note).toContain("완전 밀폐는 아니에요");
  });

  it("전체 조합에서 '확인 확인' 중복·'가장' 최상급·조사 오류 문구가 없다", () => {
    const storages = ["big_items", "drawers", "robot_vacuum", "closed", "any"] as const;
    const carries = ["self", "friend", "service"] as const;
    const assemblies = ["self", "friend", "service"] as const;
    for (const storage of storages)
      for (const carry of carries)
        for (const assembly of assemblies)
          for (const wantsMattress of [true, false, null]) {
            const a = answers({ storage, carry, assembly, wantsMattress });
            for (const p of [
              ...SEED_PRODUCTS,
              makeProduct({ mattress_price: null }),
              makeProduct({ installation_service: "paid", installation_fee: null, assembly_service_available: true }),
            ]) {
              const rec = evaluateProduct(p, a);
              expect(rec.finalJudgment).not.toContain("확인 확인");
              expect(rec.finalJudgment).not.toContain("가장 무난");
              expect(rec.finalJudgment).not.toContain("만 확인하면 돼요");
              for (const c of rec.cautions) {
                expect(c.text).not.toContain("가격는");
              }
            }
          }
  });
});
