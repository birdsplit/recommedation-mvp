import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: vi.fn(() => false),
  supabaseAdmin: vi.fn(),
}));

import {
  FUNNEL_STAGES,
  buildFunnelRows,
  createExportCsv,
  escapeCsvCell,
  exportContentDisposition,
  isExportKind,
  loadAdminFunnel,
  loadExportRows,
} from "@/lib/admin-analytics";
import { connection } from "next/server";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase";

describe("관리자 퍼널", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);
  });

  it("기획된 10개 행동 단계를 순서대로 집계한다", () => {
    expect(FUNNEL_STAGES.map((stage) => stage.eventType)).toEqual([
      "visit",
      "start_click",
      "questions_complete",
      "summary_view",
      "results_view",
      "product_detail_view",
      "compare_add",
      "cost_check",
      "outbound_click",
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

    expect(rows).toHaveLength(10);
    expect(rows[4]).toMatchObject({ count: 2, previousRate: null });
    expect(rows[5]).toMatchObject({ count: 0, previousRate: 0 });
  });

  it("요청 시점 렌더링 후 설정 안내 상태를 반환한다", async () => {
    await expect(loadAdminFunnel()).resolves.toEqual({ status: "setup" });
    expect(connection).toHaveBeenCalledOnce();
  });

  it("DB 본문을 내려받지 않고 각 단계의 exact count를 조회한다", async () => {
    const counts = new Map([
      ["visit", 12],
      ["start_click", 9],
      ["questions_complete", 6],
    ]);
    const select = vi.fn();
    const eq = vi.fn();
    const from = vi.fn(() => {
      const query = {
        select: (...args: unknown[]) => {
          select(...args);
          return query;
        },
        eq: async (_column: string, eventType: string) => {
          eq(_column, eventType);
          return { count: counts.get(eventType) ?? 0, error: null };
        },
      };
      return query;
    });

    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(supabaseAdmin).mockReturnValue({ from } as never);

    const result = await loadAdminFunnel();

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("ready 상태가 아님");
    expect(result.isEmpty).toBe(false);
    expect(result.rows.slice(0, 3)).toMatchObject([
      { eventType: "visit", count: 12 },
      { eventType: "start_click", count: 9, previousRate: 75 },
      { eventType: "questions_complete", count: 6 },
    ]);
    expect(from).toHaveBeenCalledTimes(10);
    expect(select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(eq).toHaveBeenCalledWith("event_type", "feedback_submit");
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
});
