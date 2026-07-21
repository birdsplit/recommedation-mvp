import { describe, expect, it } from "vitest";
import { REASON_CHIPS } from "@/lib/constants";
import type { ReasonChip } from "@/lib/constants";
import { DEFAULT_ANSWERS } from "../answers";
import type { Answers } from "../types";
import { makeProduct } from "./fixtures";
import {
  applyConfirmation,
  countChips,
  criterionStatus,
  decodeCriteria,
  deriveSuggestions,
  encodeCriteria,
  EMPTY_CRITERIA,
  isSessionCriteria,
  REACTION_RULES,
  tolerateRisk,
} from "../criteria";
import type {
  PreferCriterion,
  ReactionLog,
  SessionCriteria,
} from "../criteria";

const answers = (overrides: Partial<Answers> = {}): Answers => ({
  ...DEFAULT_ANSWERS,
  ...overrides,
});

const criteria = (overrides: Partial<SessionCriteria> = {}): SessionCriteria => ({
  must: [],
  prefer: [],
  tolerated: [],
  ...overrides,
});

describe("REACTION_RULES — 결정성과 칩 전수 커버리지", () => {
  it("모든 이유 칩이 규칙 표에 정확히 한 번씩 나온다", () => {
    const chipsInRules = REACTION_RULES.map((rule) => rule.chip);
    const allChips = Object.keys(REASON_CHIPS) as ReasonChip[];
    expect(new Set(chipsInRules).size).toBe(chipsInRules.length); // 중복 없음
    expect([...chipsInRules].sort()).toEqual([...allChips].sort());
  });

  it("취향 칩 design_dislike/like_design은 targetKey가 null이고 질문이 비어 있다", () => {
    for (const chip of ["design_dislike", "like_design"] as const) {
      const rule = REACTION_RULES.find((item) => item.chip === chip)!;
      expect(rule.targetKey).toBeNull();
      expect(rule.question).toBe("");
    }
  });

  it("각 규칙 id는 칩 slug와 1:1이고 임계치는 양수다", () => {
    for (const rule of REACTION_RULES) {
      expect(rule.id).toBe(rule.chip);
      expect(rule.threshold).toBeGreaterThan(0);
    }
  });
});

describe("countChips — 칩 집계", () => {
  it("빈 로그는 모든 칩을 0으로 준다", () => {
    const counts = countChips([]);
    expect(Object.keys(counts).sort()).toEqual(
      (Object.keys(REASON_CHIPS) as string[]).sort()
    );
    expect(Object.values(counts).every((value) => value === 0)).toBe(true);
  });

  it("반응 종류와 무관하게 칩 발생 횟수를 센다", () => {
    const log: ReactionLog = [
      { productId: "a", kind: "exclude", chips: ["cleaning_worry", "price_burden"] },
      { productId: "b", kind: "hold", chips: ["cleaning_worry"] },
      { productId: "c", kind: "save", chips: ["like_storage"] },
    ];
    const counts = countChips(log);
    expect(counts.cleaning_worry).toBe(2);
    expect(counts.price_burden).toBe(1);
    expect(counts.like_storage).toBe(1);
    expect(counts.assembly_worry).toBe(0);
  });
});

describe("deriveSuggestions — 임계치·중복 제거·응답 필터", () => {
  const twice = (chip: ReasonChip): ReactionLog => [
    { productId: "a", kind: "exclude", chips: [chip] },
    { productId: "b", kind: "hold", chips: [chip] },
  ];

  it("임계치 미만이면 확인 카드를 만들지 않는다", () => {
    const log: ReactionLog = [
      { productId: "a", kind: "exclude", chips: ["cleaning_worry"] },
    ];
    expect(deriveSuggestions(log, EMPTY_CRITERIA, [])).toEqual([]);
  });

  it("임계치 이상이면 대상 기준 확인 카드를 만든다", () => {
    const result = deriveSuggestions(twice("cleaning_worry"), EMPTY_CRITERIA, []);
    expect(result).toHaveLength(1);
    expect(result[0].targetKey).toBe("under_bed_clean");
    expect(result[0].question).toContain("하부 청소");
  });

  it("같은 targetKey를 노리는 두 칩이 겹쳐도 하나만 제안한다(규칙 표 순서 우선)", () => {
    const log: ReactionLog = [...twice("storage_lack"), ...twice("like_storage")];
    const result = deriveSuggestions(log, EMPTY_CRITERIA, []);
    expect(result).toHaveLength(1);
    expect(result[0].chip).toBe("storage_lack"); // 규칙 표에서 먼저 나온 쪽
    expect(result[0].targetKey).toBe("storage_big");
  });

  it("규칙 표 순서로 결정적으로 정렬된다", () => {
    const log: ReactionLog = [...twice("price_burden"), ...twice("cleaning_worry")];
    const result = deriveSuggestions(log, EMPTY_CRITERIA, []);
    expect(result.map((item) => item.targetKey)).toEqual([
      "under_bed_clean", // cleaning_worry가 표에서 먼저
      "low_total_cost",
    ]);
  });

  it("answeredIds에 있는 카드는 제외하되, 같은 기준의 다른 칩은 아직 뜰 수 있다", () => {
    const log: ReactionLog = [...twice("storage_lack"), ...twice("like_storage")];
    const result = deriveSuggestions(log, EMPTY_CRITERIA, ["storage_lack"]);
    expect(result).toHaveLength(1);
    expect(result[0].chip).toBe("like_storage");
  });

  it("이미 must/prefer에 있는 기준은 다시 제안하지 않는다", () => {
    const inMust = criteria({ must: ["under_bed_clean"] });
    expect(deriveSuggestions(twice("cleaning_worry"), inMust, [])).toEqual([]);
    const inPrefer = criteria({
      prefer: [{ key: "under_bed_clean", weight: 2, origin: "like_clean" }],
    });
    expect(deriveSuggestions(twice("cleaning_worry"), inPrefer, [])).toEqual([]);
  });

  it("취향 칩(design_dislike)은 임계치를 넘어도 확인 카드를 만들지 않는다", () => {
    expect(deriveSuggestions(twice("design_dislike"), EMPTY_CRITERIA, [])).toEqual(
      []
    );
  });
});

describe("applyConfirmation — 분류 이동(불변)", () => {
  const suggestion = REACTION_RULES.find((r) => r.chip === "cleaning_worry")!;

  it("'must'는 필수에 추가하고 같은 키를 선호에서 제거한다", () => {
    const start = criteria({
      prefer: [{ key: "under_bed_clean", weight: 2, origin: "cleaning_worry" }],
    });
    const next = applyConfirmation(start, suggestion, "must");
    expect(next.must).toContain("under_bed_clean");
    expect(next.prefer.some((p) => p.key === "under_bed_clean")).toBe(false);
    // 원본 불변
    expect(start.must).toEqual([]);
    expect(start.prefer).toHaveLength(1);
  });

  it("'prefer'는 없을 때만 defaultWeight·origin으로 추가한다", () => {
    const next = applyConfirmation(EMPTY_CRITERIA, suggestion, "prefer");
    expect(next.prefer).toEqual([
      { key: "under_bed_clean", weight: suggestion.defaultWeight, origin: "cleaning_worry" },
    ]);
    // 이미 있으면 그대로
    const again = applyConfirmation(next, suggestion, "prefer");
    expect(again).toBe(next);
  });

  it("'prefer'는 이미 필수에 있으면 추가하지 않는다", () => {
    const inMust = criteria({ must: ["under_bed_clean"] });
    const next = applyConfirmation(inMust, suggestion, "prefer");
    expect(next.prefer).toEqual([]);
  });

  it("'no'는 그대로 반환한다", () => {
    expect(applyConfirmation(EMPTY_CRITERIA, suggestion, "no")).toBe(
      EMPTY_CRITERIA
    );
  });

  it("targetKey가 null인 취향 칩은 어떤 답에도 그대로다", () => {
    const design = REACTION_RULES.find((r) => r.chip === "design_dislike")!;
    expect(applyConfirmation(EMPTY_CRITERIA, design, "must")).toBe(EMPTY_CRITERIA);
  });

  it("must 승격은 중복 키를 만들지 않는다", () => {
    const inMust = criteria({ must: ["under_bed_clean"] });
    const next = applyConfirmation(inMust, suggestion, "must");
    expect(next.must).toEqual(["under_bed_clean"]);
  });
});

describe("tolerateRisk — 감당 가능한 단점(불변)", () => {
  it("리스크를 추가하고 원본을 변형하지 않는다", () => {
    const next = tolerateRisk(EMPTY_CRITERIA, "squeak");
    expect(next.tolerated).toEqual(["squeak"]);
    expect(EMPTY_CRITERIA.tolerated).toEqual([]);
  });

  it("이미 있는 리스크는 그대로 반환한다", () => {
    const start = criteria({ tolerated: ["squeak"] });
    expect(tolerateRisk(start, "squeak")).toBe(start);
  });
});

describe("criterionStatus — 필드 기반 tri-state 판정", () => {
  it("storage_big: 구조+용량 met, 용량 null unknown, 구조 불일치 not_met", () => {
    expect(
      criterionStatus(
        "storage_big",
        makeProduct({ storage_type: "lift_up", storage_capacity: "large" }),
        answers()
      )
    ).toBe("met");
    expect(
      criterionStatus(
        "storage_big",
        makeProduct({ storage_type: "drawer", storage_capacity: "medium" }),
        answers()
      )
    ).toBe("met");
    expect(
      criterionStatus(
        "storage_big",
        makeProduct({ storage_type: "lift_up", storage_capacity: "small" }),
        answers()
      )
    ).toBe("not_met");
    expect(
      criterionStatus(
        "storage_big",
        makeProduct({ storage_type: "legs_open", storage_capacity: "large" }),
        answers()
      )
    ).toBe("not_met");
    expect(
      criterionStatus(
        "storage_big",
        makeProduct({ storage_type: "lift_up", storage_capacity: null }),
        answers()
      )
    ).toBe("unknown");
  });

  it("storage_drawer: drawer만 met, 나머지 not_met", () => {
    expect(
      criterionStatus("storage_drawer", makeProduct({ storage_type: "drawer" }), answers())
    ).toBe("met");
    expect(
      criterionStatus("storage_drawer", makeProduct({ storage_type: "lift_up" }), answers())
    ).toBe("not_met");
  });

  it("under_bed_clean: 로봇 ok/다리형 met, 근거 둘 다 null이면 unknown", () => {
    expect(
      criterionStatus(
        "under_bed_clean",
        makeProduct({ robot_vacuum_fit: "ok", storage_type: "closed_base" }),
        answers()
      )
    ).toBe("met");
    // 로봇 no라도 다리형이면 met
    expect(
      criterionStatus(
        "under_bed_clean",
        makeProduct({ robot_vacuum_fit: "no", storage_type: "legs_open" }),
        answers()
      )
    ).toBe("met");
    // 근거가 둘 다 없으면 unknown
    expect(
      criterionStatus(
        "under_bed_clean",
        makeProduct({
          robot_vacuum_fit: null,
          cleaning_ease: null,
          storage_type: "closed_base",
        }),
        answers()
      )
    ).toBe("unknown");
    // cleaning_ease로 보수적 판정
    expect(
      criterionStatus(
        "under_bed_clean",
        makeProduct({ robot_vacuum_fit: null, cleaning_ease: "easy", storage_type: "closed_base" }),
        answers()
      )
    ).toBe("met");
    expect(
      criterionStatus(
        "under_bed_clean",
        makeProduct({ robot_vacuum_fit: null, cleaning_ease: "hard", storage_type: "closed_base" }),
        answers()
      )
    ).toBe("not_met");
    // 애매한 조합(check_height + medium)은 unknown으로 남긴다
    expect(
      criterionStatus(
        "under_bed_clean",
        makeProduct({
          robot_vacuum_fit: "check_height",
          cleaning_ease: "medium",
          storage_type: "closed_base",
        }),
        answers()
      )
    ).toBe("unknown");
  });

  it("dust_block: high met, low not_met, null unknown", () => {
    expect(
      criterionStatus("dust_block", makeProduct({ dust_blocking: "high" }), answers())
    ).toBe("met");
    expect(
      criterionStatus("dust_block", makeProduct({ dust_blocking: "low" }), answers())
    ).toBe("not_met");
    expect(
      criterionStatus("dust_block", makeProduct({ dust_blocking: null }), answers())
    ).toBe("unknown");
  });

  it("easy_assembly: 쉬운 조립 met, 서비스 탈출구 met, null unknown, 그 외 not_met", () => {
    expect(
      criterionStatus(
        "easy_assembly",
        makeProduct({ self_assembly: "easy", assembly_people: 1 }),
        answers()
      )
    ).toBe("met");
    // 조립 서비스 제공 시 self_assembly가 어려워도 met
    expect(
      criterionStatus(
        "easy_assembly",
        makeProduct({ self_assembly: "hard", assembly_service_available: true }),
        answers()
      )
    ).toBe("met");
    // 권장 인원 2명이면 혼자 쉬운 조립이 아니다
    expect(
      criterionStatus(
        "easy_assembly",
        makeProduct({ self_assembly: "easy", assembly_people: 2, assembly_service_available: false }),
        answers()
      )
    ).toBe("not_met");
    expect(
      criterionStatus(
        "easy_assembly",
        makeProduct({ self_assembly: null, assembly_service_available: false }),
        answers()
      )
    ).toBe("unknown");
    // 레거시 false 서비스는 met으로 인정하지 않는다
    expect(
      criterionStatus(
        "easy_assembly",
        makeProduct({
          self_assembly: "hard",
          assembly_service_available: false,
          unknown_fields: ["assembly_service_available"],
        }),
        answers()
      )
    ).toBe("not_met");
  });

  it("fast_delivery: 14일 이내 met, 초과 not_met, 미확인 필드 unknown", () => {
    expect(
      criterionStatus("fast_delivery", makeProduct({ delivery_days_max: 14 }), answers())
    ).toBe("met");
    expect(
      criterionStatus("fast_delivery", makeProduct({ delivery_days_max: 20 }), answers())
    ).toBe("not_met");
    expect(
      criterionStatus(
        "fast_delivery",
        makeProduct({
          delivery_days_max: 3,
          unknown_fields: ["delivery_days_max"],
        }),
        answers()
      )
    ).toBe("unknown");
  });

  it("mattress_included: true met, false not_met, 미확인 필드 unknown", () => {
    expect(
      criterionStatus("mattress_included", makeProduct({ mattress_included: true }), answers())
    ).toBe("met");
    expect(
      criterionStatus("mattress_included", makeProduct({ mattress_included: false }), answers())
    ).toBe("not_met");
    expect(
      criterionStatus(
        "mattress_included",
        makeProduct({ mattress_included: false, unknown_fields: ["mattress_included"] }),
        answers()
      )
    ).toBe("unknown");
  });

  it("low_review_risk: 표본 없으면 unknown, 심각 리스크 없으면 met, 있으면 not_met", () => {
    // 표본 없음
    expect(
      criterionStatus("low_review_risk", makeProduct({ review_sample_count: undefined }), answers())
    ).toBe("unknown");
    expect(
      criterionStatus("low_review_risk", makeProduct({ review_sample_count: 0 }), answers())
    ).toBe("unknown");
    // 표본 있고 리스크 없음
    expect(
      criterionStatus(
        "low_review_risk",
        makeProduct({ review_sample_count: 5, review_risks: [] }),
        answers()
      )
    ).toBe("met");
    // 감점 2 이상 리스크가 있으면 not_met (missing_parts는 직접 조립 사용자에게 2)
    expect(
      criterionStatus(
        "low_review_risk",
        makeProduct({ review_sample_count: 5, review_risks: ["missing_parts"] }),
        answers({ assembly: "self" })
      )
    ).toBe("not_met");
    // tolerated로 표시하면 감점이 면제되어 met
    expect(
      criterionStatus(
        "low_review_risk",
        makeProduct({ review_sample_count: 5, review_risks: ["missing_parts"] }),
        answers({ assembly: "self" }),
        { tolerated: ["missing_parts"] }
      )
    ).toBe("met");
  });
});

describe("criterionStatus — low_total_cost P25 결정성(동점 포함)", () => {
  const cheap = (total: number) =>
    makeProduct({ price: total, shipping_fee: 0, shipping_fee_confidence: "confirmed" });

  it("풀이 없으면 unknown, 미확인 총비용이면 unknown", () => {
    expect(criterionStatus("low_total_cost", cheap(100000), answers())).toBe(
      "unknown"
    );
    const unknownCost = makeProduct({
      shipping_fee: 0,
      shipping_fee_confidence: "unknown",
    });
    expect(
      criterionStatus("low_total_cost", unknownCost, answers(), {
        pool: [{ knownTotal: 100000 }],
      })
    ).toBe("unknown");
  });

  it("하위 25% 이내면 met, 초과면 not_met", () => {
    const pool = [
      { knownTotal: 100000 },
      { knownTotal: 200000 },
      { knownTotal: 300000 },
      { knownTotal: 400000 },
    ];
    // floor(0.25 * 3) = 0 → 임계선 100000
    expect(criterionStatus("low_total_cost", cheap(100000), answers(), { pool })).toBe(
      "met"
    );
    expect(criterionStatus("low_total_cost", cheap(150000), answers(), { pool })).toBe(
      "not_met"
    );
  });

  it("동점이 있어도 입력 순서와 무관하게 결정적이다", () => {
    const poolA = [
      { knownTotal: 100000 },
      { knownTotal: 100000 },
      { knownTotal: 200000 },
      { knownTotal: 300000 },
    ];
    const poolB = [...poolA].reverse();
    const status = (pool: { knownTotal: number }[]) =>
      criterionStatus("low_total_cost", cheap(100000), answers(), { pool });
    expect(status(poolA)).toBe("met");
    expect(status(poolB)).toBe("met");
    expect(
      criterionStatus("low_total_cost", cheap(100001), answers(), { pool: poolA })
    ).toBe("not_met");
  });
});

describe("encodeCriteria/decodeCriteria — URL 코덱", () => {
  it("must·prefer·tolerated 왕복이 안정적이다", () => {
    const original: SessionCriteria = {
      must: ["storage_big", "under_bed_clean"],
      prefer: [{ key: "low_total_cost", weight: 2, origin: "like_price" }],
      tolerated: ["squeak"],
    };
    const encoded = encodeCriteria(original);
    const decoded = decodeCriteria(encoded);
    expect(decoded).toEqual(original);
    // 재인코딩도 동일 (idempotent)
    expect(encodeCriteria(decoded)).toBe(encoded);
  });

  it("스펙 예시(생략된 origin)는 rule 폴백 origin으로 복원된다", () => {
    const decoded = decodeCriteria("m:storage_big,under_bed_clean;p:low_total_cost.2;t:squeak");
    expect(decoded.must).toEqual(["storage_big", "under_bed_clean"]);
    expect(decoded.prefer).toEqual([
      { key: "low_total_cost", weight: 2, origin: "price_burden" },
    ]);
    expect(decoded.tolerated).toEqual(["squeak"]);
  });

  it("빈 입력은 EMPTY_CRITERIA 형태를 준다", () => {
    expect(decodeCriteria(undefined)).toEqual(EMPTY_CRITERIA);
    expect(decodeCriteria("")).toEqual(EMPTY_CRITERIA);
    expect(encodeCriteria(EMPTY_CRITERIA)).toBe("");
  });

  it("악의적/불량 입력의 무효 토큰을 조용히 버린다", () => {
    const decoded = decodeCriteria(
      "m:__proto__,constructor,hasOwnProperty,storage_big,storage_big;garbage;;;p:__proto__.9.__proto__,low_total_cost.99.constructor;t:toString,squeak"
    );
    // 유효한 키만, 중복 제거
    expect(decoded.must).toEqual(["storage_big"]);
    // 무효 origin은 rule 폴백, 무효 weight(99)는 기본값으로 클램프
    expect(decoded.prefer).toEqual([
      { key: "low_total_cost", weight: 2, origin: "price_burden" },
    ]);
    expect(decoded.tolerated).toEqual(["squeak"]);
  });

  it("필수로 올라간 키는 선호에서 빠져 왕복이 안정적이다", () => {
    const decoded = decodeCriteria("m:storage_big;p:storage_big.3.like_storage");
    expect(decoded.must).toEqual(["storage_big"]);
    expect(decoded.prefer).toEqual([]);
  });

  it("코덱은 유효 키 수 상한을 절대 넘지 않는다(자연 상한)", () => {
    // 같은 키를 반복해도 중복 제거로 하나만 남는다
    const decoded = decodeCriteria(`m:${Array(30).fill("storage_big").join(",")}`);
    expect(decoded.must).toEqual(["storage_big"]);
  });
});

describe("isSessionCriteria — 엄격 검증", () => {
  const validPrefer: PreferCriterion = {
    key: "low_total_cost",
    weight: 2,
    origin: "like_price",
  };

  it("올바른 구조를 수락한다", () => {
    expect(
      isSessionCriteria({
        must: ["storage_big"],
        prefer: [validPrefer],
        tolerated: ["squeak"],
      })
    ).toBe(true);
    expect(isSessionCriteria(EMPTY_CRITERIA)).toBe(true);
  });

  it("객체가 아니거나 배열이면 거부한다", () => {
    expect(isSessionCriteria(null)).toBe(false);
    expect(isSessionCriteria("x")).toBe(false);
    expect(isSessionCriteria([])).toBe(false);
    expect(isSessionCriteria({ must: "x", prefer: [], tolerated: [] })).toBe(false);
  });

  it("무효 키·중복·상속 키를 거부한다", () => {
    expect(isSessionCriteria({ must: ["nope"], prefer: [], tolerated: [] })).toBe(false);
    expect(isSessionCriteria({ must: ["__proto__"], prefer: [], tolerated: [] })).toBe(false);
    expect(
      isSessionCriteria({ must: ["storage_big", "storage_big"], prefer: [], tolerated: [] })
    ).toBe(false);
  });

  it("선호 항목의 무효 weight·origin·중복을 거부한다", () => {
    expect(
      isSessionCriteria({ must: [], prefer: [{ key: "low_total_cost", weight: 0, origin: "like_price" }], tolerated: [] })
    ).toBe(false);
    expect(
      isSessionCriteria({ must: [], prefer: [{ key: "low_total_cost", weight: 2.5, origin: "like_price" }], tolerated: [] })
    ).toBe(false);
    expect(
      isSessionCriteria({ must: [], prefer: [{ key: "low_total_cost", weight: 2, origin: "nope" }], tolerated: [] })
    ).toBe(false);
    // must와 prefer가 같은 키를 동시에 가지면 거부
    expect(
      isSessionCriteria({ must: ["low_total_cost"], prefer: [validPrefer], tolerated: [] })
    ).toBe(false);
  });

  it("tolerated의 무효 리스크를 거부한다", () => {
    expect(isSessionCriteria({ must: [], prefer: [], tolerated: ["nope"] })).toBe(false);
    expect(isSessionCriteria({ must: [], prefer: [], tolerated: ["squeak", "squeak"] })).toBe(
      false
    );
  });

  it("배열 상한(must≤9, prefer≤9, tolerated≤10)을 넘으면 거부한다", () => {
    expect(
      isSessionCriteria({ must: Array(10).fill("storage_big"), prefer: [], tolerated: [] })
    ).toBe(false);
    expect(
      isSessionCriteria({ must: [], prefer: Array(10).fill(validPrefer), tolerated: [] })
    ).toBe(false);
    expect(
      isSessionCriteria({ must: [], prefer: [], tolerated: Array(11).fill("squeak") })
    ).toBe(false);
  });
});
