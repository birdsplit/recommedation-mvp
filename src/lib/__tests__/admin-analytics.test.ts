import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: vi.fn(() => false),
  supabaseAdmin: vi.fn(),
}));

import {
  BRANCH_ACTIONS,
  FUNNEL_STAGES,
  buildBranchRows,
  buildFunnelRows,
  computeExperimentSummary,
  createExportCsv,
  escapeCsvCell,
  exportContentDisposition,
  isExportKind,
  loadAdminFunnel,
  loadCohortFeedback,
  loadCohortFunnel,
  loadExportRows,
  loadReactionStats,
  type CohortFeedback,
  type CohortFunnel,
} from "@/lib/admin-analytics";
import { connection } from "next/server";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase";

describe("관리자 퍼널", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);
  });

  it("결과 전 5단계와 결과 후 분기 행동을 분리한다", () => {
    expect(FUNNEL_STAGES.map((stage) => stage.eventType)).toEqual([
      "visit",
      "start_click",
      "questions_complete",
      "summary_view",
      "results_view",
    ]);
    expect(BRANCH_ACTIONS.map((stage) => stage.eventType)).toEqual([
      "product_detail_view",
      "compare_add",
      "cost_check",
      "outbound_click",
      "source_open",
      "feedback_submit",
    ]);
  });

  it("전 단계 대비 비율을 소수점 한 자리까지 계산한다", () => {
    const rows = buildFunnelRows({
      visit: 10,
      start_click: 8,
      questions_complete: 3,
      summary_view: 6,
    });

    expect(rows[0].previousRate).toBeNull();
    expect(rows[1].previousRate).toBe(80);
    expect(rows[2].previousRate).toBe(37.5);
    expect(rows[3].previousRate).toBe(200);
  });

  it("전 단계가 0건이면 오해를 부르는 퍼센트를 만들지 않는다", () => {
    const rows = buildFunnelRows({ results_view: 2 });

    expect(rows).toHaveLength(5);
    expect(rows[4]).toMatchObject({ count: 2, previousRate: null });
    expect(buildBranchRows({ results_view: 2, cost_check: 1 })[2]).toMatchObject({
      eventType: "cost_check",
      count: 1,
      resultsRate: 50,
    });
  });

  it("요청 시점 렌더링 후 설정 안내 상태를 반환한다", async () => {
    await expect(loadAdminFunnel()).resolves.toEqual({ status: "setup" });
    expect(connection).toHaveBeenCalledOnce();
  });

  it("SQL 집계 함수의 고유 journey 결과를 퍼널과 분기로 나눈다", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { event_type: "visit", journey_count: 12 },
        { event_type: "start_click", journey_count: 9 },
        { event_type: "questions_complete", journey_count: 6 },
        { event_type: "results_view", journey_count: 4 },
        { event_type: "outbound_click", journey_count: 2 },
      ],
      error: null,
    });

    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(supabaseAdmin).mockReturnValue({ rpc } as never);

    const result = await loadAdminFunnel();

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("ready 상태가 아님");
    expect(result.isEmpty).toBe(false);
    expect(result.rows.slice(0, 3)).toMatchObject([
      { eventType: "visit", count: 12 },
      { eventType: "start_click", count: 9, previousRate: 75 },
      { eventType: "questions_complete", count: 6 },
    ]);
    expect(result.branches.find((row) => row.eventType === "outbound_click"))
      .toMatchObject({ count: 2, resultsRate: 50 });
    expect(rpc).toHaveBeenCalledWith("admin_journey_event_counts");
  });
});

describe("CSV", () => {
  it("지원하는 종류만 허용한다", () => {
    expect(isExportKind("events")).toBe(true);
    expect(isExportKind("feedback")).toBe(true);
    expect(isExportKind("products")).toBe(false);
  });

  it("쉼표·따옴표·개행을 수기로 escape한다", () => {
    expect(escapeCsvCell("침대,프레임")).toBe('"침대,프레임"');
    expect(escapeCsvCell('그는 "좋다"고 함')).toBe(
      '"그는 ""좋다""고 함"'
    );
    expect(escapeCsvCell("첫 줄\n둘째 줄")).toBe('"첫 줄\n둘째 줄"');
  });

  it("사용자 문자열이 엑셀 수식으로 실행되지 않게 막는다", () => {
    expect(escapeCsvCell("=HYPERLINK(\"https://example.com\")")).toBe(
      '"\'=HYPERLINK(""https://example.com"")"'
    );
    expect(escapeCsvCell("일반 문장")).toBe("일반 문장");
  });

  it("BOM·CRLF·한글 헤더와 JSON payload를 보존한다", () => {
    const csv = createExportCsv("events", [
      {
        id: 1,
        session_id: "00000000-0000-4000-8000-000000000001",
        event_type: "results_view",
        payload: { source: "추천,결과", rank: 1 },
        created_at: "2026-07-11T00:00:00.000Z",
      },
    ]);

    expect(csv.startsWith("\uFEFF이벤트 ID,익명 세션 ID")).toBe(true);
    expect(csv).toContain('"{""source"":""추천,결과"",""rank"":1}"');
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.replaceAll("\r\n", "")).not.toContain("\n");
  });

  it("피드백 boolean을 읽기 쉬운 한글로 내보낸다", () => {
    const csv = createExportCsv("feedback", [
      {
        id: 1,
        session_id: "00000000-0000-4000-8000-000000000001",
        q_time_saved: 5,
        q_conditions_reflected: 4,
        q_reasons_helpful: 3,
        q_found_candidate: true,
        q_would_reuse: false,
        q_worst_question: null,
        chosen_product_id: null,
        post_purchase_optin: true,
        created_at: "2026-07-11T00:00:00.000Z",
      },
    ]);

    expect(csv).toContain(",예,아니오,,,예,");
  });

  it("한글 파일명과 ASCII fallback을 함께 제공한다", () => {
    const disposition = exportContentDisposition(
      "feedback",
      new Date("2026-07-11T00:00:00.000Z")
    );

    expect(disposition).toContain('filename="modoo-feedback-20260711.csv"');
    expect(disposition).toContain("filename*=UTF-8''");
    expect(decodeURIComponent(disposition.split("filename*=UTF-8''")[1])).toBe(
      "모두의침대-피드백-20260711.csv"
    );
  });

  it("Supabase 기본 제한을 넘어도 다음 페이지를 이어서 조회한다", async () => {
    const firstPage = Array.from({ length: 1_000 }, (_, id) => ({ id }));
    const range = vi
      .fn()
      .mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({ data: [{ id: 1_000 }], error: null });
    const query = {
      select: vi.fn(),
      order: vi.fn(),
      range,
    };
    query.select.mockReturnValue(query);
    query.order.mockReturnValue(query);
    const from = vi.fn(() => query);

    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(supabaseAdmin).mockReturnValue({ from } as never);

    const rows = await loadExportRows("events");

    expect(rows).toHaveLength(1_001);
    expect(range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(range).toHaveBeenNthCalledWith(2, 1_000, 1_999);
  });

  it("피드백 CSV에 결정 확신도 열을 이유 도움과 고려 발견 사이에 넣는다", () => {
    const csv = createExportCsv("feedback", [
      {
        id: 1,
        session_id: "00000000-0000-4000-8000-000000000001",
        q_time_saved: 5,
        q_conditions_reflected: 4,
        q_reasons_helpful: 3,
        q_decision_confidence: 2,
        q_found_candidate: true,
        q_would_reuse: false,
        post_purchase_optin: false,
        created_at: "2026-07-11T00:00:00.000Z",
      },
    ]);

    expect(csv).toContain("이유 도움 (1~5),결정 확신도 (1~5),고려 상품 발견");
    // 값도 이유(3) → 확신도(2) → 고려발견(예) 순서로 나온다
    expect(csv).toContain(",3,2,예,");
  });
});

describe("코호트 퍼널 (admin_cohort_event_counts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);
  });

  it("설정 전에는 setup 상태를 반환한다", async () => {
    await expect(loadCohortFunnel()).resolves.toEqual({ status: "setup" });
    expect(connection).toHaveBeenCalledOnce();
  });

  it("oneshot·loop·미배정으로 나누고 loop 전용 이벤트를 counts에 보존한다", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { cohort: "oneshot", event_type: "visit", journey_count: 100 },
        { cohort: "oneshot", event_type: "results_view", journey_count: 40 },
        { cohort: "oneshot", event_type: "outbound_click", journey_count: 8 },
        { cohort: "loop", event_type: "visit", journey_count: 50 },
        { cohort: "loop", event_type: "results_view", journey_count: 10 },
        { cohort: "loop", event_type: "shortlist_finalize", journey_count: 5 },
        { cohort: "", event_type: "visit", journey_count: 7 },
        { cohort: null, event_type: "results_view", journey_count: 3 },
        { cohort: "internal-qa", event_type: "visit", journey_count: 2 },
      ],
      error: null,
    });
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(supabaseAdmin).mockReturnValue({ rpc } as never);

    const result = await loadCohortFunnel();

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("ready 상태가 아님");
    expect(result.cohorts.map((cohort) => cohort.cohort)).toEqual([
      "oneshot",
      "loop",
      "",
    ]);

    const [oneshot, loop, unassigned] = result.cohorts;
    expect(oneshot.isAssigned).toBe(true);
    expect(oneshot.counts.visit).toBe(100);
    expect(
      oneshot.rows.find((row) => row.eventType === "results_view")
    ).toMatchObject({ count: 40 });
    // shortlist_finalize는 퍼널/분기 행에는 없지만 원시 counts에는 남는다
    expect(loop.counts.shortlist_finalize).toBe(5);
    // 빈 문자열·null·미지 코호트는 하나의 미배정 버킷으로 합산된다
    expect(unassigned.cohort).toBe("");
    expect(unassigned.isAssigned).toBe(false);
    expect(unassigned.label).toBe("(미배정)");
    expect(unassigned.counts.visit).toBe(9);
    expect(unassigned.counts.results_view).toBe(3);
    expect(rpc).toHaveBeenCalledWith("admin_cohort_event_counts");
  });

  it("미배정 트래픽이 없으면 두 팔만 남기고 항상 두 칸을 채운다", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ cohort: "oneshot", event_type: "visit", journey_count: 3 }],
      error: null,
    });
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(supabaseAdmin).mockReturnValue({ rpc } as never);

    const result = await loadCohortFunnel();

    if (result.status !== "ready") throw new Error("ready 상태가 아님");
    expect(result.cohorts.map((cohort) => cohort.cohort)).toEqual([
      "oneshot",
      "loop",
    ]);
    expect(result.cohorts[1].isEmpty).toBe(true);
    expect(result.isEmpty).toBe(false);
  });

  it("RPC 오류는 error 상태로 처리한다", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "boom" } });
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(supabaseAdmin).mockReturnValue({ rpc } as never);

    await expect(loadCohortFunnel()).resolves.toEqual({ status: "error" });
  });
});

describe("코호트 피드백 (admin_cohort_feedback)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);
  });

  it("응답이 없는 팔도 0/null로 채우고 numeric 문자열을 수로 바꾼다", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          mode: "oneshot",
          feedback_count: "12",
          avg_confidence: "4.25",
          avg_time_saved: "4.0",
          avg_conditions: "3.5",
          avg_reasons: "3.9",
          found_rate: "0.75",
          reuse_rate: "0.5",
        },
      ],
      error: null,
    });
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(supabaseAdmin).mockReturnValue({ rpc } as never);

    const result = await loadCohortFeedback();

    if (result.status !== "ready") throw new Error("ready 상태가 아님");
    expect(result.cohorts.map((cohort) => cohort.mode)).toEqual([
      "oneshot",
      "loop",
    ]);
    const [oneshot, loop] = result.cohorts;
    expect(oneshot.feedbackCount).toBe(12);
    expect(oneshot.avgConfidence).toBe(4.25);
    expect(oneshot.foundRate).toBe(0.75);
    // 응답이 없는 loop 팔
    expect(loop.feedbackCount).toBe(0);
    expect(loop.avgConfidence).toBeNull();
    expect(loop.foundRate).toBeNull();
    expect(result.isEmpty).toBe(false);
    expect(rpc).toHaveBeenCalledWith("admin_cohort_feedback");
  });
});

describe("computeExperimentSummary — H1·H3 요약", () => {
  function funnelFixture(
    cohort: CohortFunnel["cohort"],
    counts: Record<string, number>
  ): CohortFunnel {
    return {
      cohort,
      label: cohort === "" ? "(미배정)" : cohort,
      isAssigned: cohort !== "",
      counts,
      rows: buildFunnelRows(counts),
      branches: buildBranchRows(counts),
      isEmpty: false,
    };
  }

  function feedbackFixture(
    mode: CohortFeedback["mode"],
    overrides: Partial<CohortFeedback> = {}
  ): CohortFeedback {
    return {
      mode,
      label: mode,
      feedbackCount: 0,
      avgConfidence: null,
      avgTimeSaved: null,
      avgConditions: null,
      avgReasons: null,
      foundRate: null,
      reuseRate: null,
      ...overrides,
    };
  }

  it("완주율·이동률·최종확정·확신도를 팔별로 계산하고 순서를 정규화한다", () => {
    // 입력 순서를 뒤섞어도 항상 [oneshot, loop] 순으로 반환한다
    const summaries = computeExperimentSummary(
      [
        funnelFixture("loop", {
          visit: 50,
          results_view: 10,
          outbound_click: 2,
          shortlist_finalize: 5,
        }),
        funnelFixture("oneshot", {
          visit: 100,
          results_view: 40,
          outbound_click: 8,
        }),
      ],
      [
        feedbackFixture("oneshot", { avgConfidence: 4.2, foundRate: 0.75 }),
        feedbackFixture("loop", { avgConfidence: 3.1, foundRate: 0.5 }),
      ]
    );

    const [oneshot, loop] = summaries;
    expect(oneshot.mode).toBe("oneshot");
    expect(oneshot.journeys).toBe(100);
    expect(oneshot.completionRate).toBeCloseTo(0.4);
    expect(oneshot.outboundRate).toBeCloseTo(0.2);
    expect(oneshot.finalizeCount).toBe(0);
    expect(oneshot.avgConfidence).toBe(4.2);
    expect(oneshot.foundRate).toBe(0.75);
    expect(oneshot.meetsCompletionTarget).toBe(true);
    expect(oneshot.meetsOutboundTarget).toBe(true);

    expect(loop.mode).toBe("loop");
    expect(loop.completionRate).toBeCloseTo(0.2);
    expect(loop.meetsCompletionTarget).toBe(false); // 0.2 < 0.30
    expect(loop.outboundRate).toBeCloseTo(0.2);
    expect(loop.meetsOutboundTarget).toBe(true);
    expect(loop.finalizeCount).toBe(5); // loop 전용 이벤트
  });

  it("0 나눗셈을 null로 막고 목표 배지도 미달로 둔다", () => {
    const [oneshot, loop] = computeExperimentSummary(
      [funnelFixture("oneshot", { visit: 0, results_view: 0, outbound_click: 0 })],
      []
    );

    expect(oneshot.completionRate).toBeNull(); // visit 0
    expect(oneshot.outboundRate).toBeNull(); // results_view 0
    expect(oneshot.meetsCompletionTarget).toBe(false);
    expect(oneshot.meetsOutboundTarget).toBe(false);
    expect(oneshot.avgConfidence).toBeNull();
    expect(oneshot.foundRate).toBeNull();
    // 입력에 없어도 loop 칸은 0으로 존재한다
    expect(loop.mode).toBe("loop");
    expect(loop.journeys).toBe(0);
  });

  it("결과는 있으나 이동이 없으면 완주율 0, 이동률 null이다", () => {
    const [summary] = computeExperimentSummary(
      [funnelFixture("oneshot", { visit: 10, results_view: 0 })],
      []
    );
    expect(summary.completionRate).toBe(0); // 0 / 10
    expect(summary.outboundRate).toBeNull(); // results_view 0
    expect(summary.meetsCompletionTarget).toBe(false);
  });

  it("목표 경계값(완주 0.30·이동 0.10)은 달성으로 본다", () => {
    const [summary] = computeExperimentSummary(
      [funnelFixture("oneshot", { visit: 20, results_view: 6, outbound_click: 2 })],
      []
    );
    // 6/20 = 0.30, 2/6 ≈ 0.333
    expect(summary.completionRate).toBeCloseTo(0.3);
    expect(summary.meetsCompletionTarget).toBe(true);

    const [exact] = computeExperimentSummary(
      [funnelFixture("oneshot", { visit: 20, results_view: 10, outbound_click: 1 })],
      []
    );
    // 1/10 = 0.10 정확히 목표선
    expect(exact.outboundRate).toBeCloseTo(0.1);
    expect(exact.meetsOutboundTarget).toBe(true);
  });
});

describe("loadReactionStats — 반응·기준 확인 집계", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);
  });

  it("설정 전에는 setup 상태를 반환한다", async () => {
    await expect(loadReactionStats()).resolves.toEqual({ status: "setup" });
    expect(connection).toHaveBeenCalledOnce();
  });

  it("kind·chips·bucket을 집계하고 잘못된 payload는 건너뛴다", async () => {
    const reactionData = [
      { payload: { kind: "save", chips: ["like_price", "like_storage"] } },
      { payload: { kind: "save", chips: ["like_price"] } },
      { payload: { kind: "exclude", chips: ["price_burden"] } },
      { payload: { kind: "hold", chips: [] } },
      { payload: { kind: "bogus", chips: ["like_price"] } }, // 미지 kind — 총계엔 포함, byKind엔 제외
      { payload: "not-an-object" }, // 문자열 payload — 통째로 건너뜀
      { payload: { kind: "save" } }, // chips 없음 — 허용
      { note: "no payload key" }, // payload 없음 — 건너뜀
    ];
    const confirmData = [
      { payload: { bucket: "must" } },
      { payload: { bucket: "must" } },
      { payload: { bucket: "prefer" } },
      { payload: { bucket: "dismissed" } },
      { payload: { bucket: "weird" } }, // 미지 bucket — 건너뜀
      { payload: [1, 2, 3] }, // 배열 payload — 건너뜀
      { payload: null }, // null payload — 건너뜀
    ];
    const range = vi
      .fn()
      .mockResolvedValueOnce({ data: reactionData, error: null })
      .mockResolvedValueOnce({ data: confirmData, error: null });
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      range,
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    const from = vi.fn(() => query);
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(supabaseAdmin).mockReturnValue({ from } as never);

    const result = await loadReactionStats();

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("ready 상태가 아님");
    expect(result.stats.totalReactions).toBe(6); // 객체 payload 6건만
    expect(result.stats.byKind).toEqual({ save: 3, exclude: 1, hold: 1 });
    expect(result.stats.topChips).toEqual([
      { chip: "like_price", count: 3 },
      { chip: "like_storage", count: 1 },
      { chip: "price_burden", count: 1 },
    ]);
    expect(result.stats.confirmBuckets).toEqual({
      must: 2,
      prefer: 1,
      dismissed: 1,
    });
    expect(result.isEmpty).toBe(false);

    // 테스트 트래픽 제외 + 이벤트별 필터를 확인한다
    expect(from).toHaveBeenCalledWith("events");
    expect(query.eq).toHaveBeenCalledWith("event_type", "candidate_reaction");
    expect(query.eq).toHaveBeenCalledWith("event_type", "criteria_confirm");
    expect(query.eq).toHaveBeenCalledWith("is_test", false);
    expect(range).toHaveBeenNthCalledWith(1, 0, 999);
  });

  it("반응도 기준 확인도 없으면 isEmpty가 true다", async () => {
    const range = vi.fn().mockResolvedValue({ data: [], error: null });
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      range,
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(supabaseAdmin).mockReturnValue({ from: vi.fn(() => query) } as never);

    const result = await loadReactionStats();

    if (result.status !== "ready") throw new Error("ready 상태가 아님");
    expect(result.stats.totalReactions).toBe(0);
    expect(result.isEmpty).toBe(true);
  });
});
