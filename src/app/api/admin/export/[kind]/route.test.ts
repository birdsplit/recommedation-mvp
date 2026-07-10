import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAdminAuthenticated: vi.fn(),
  loadExportRows: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({
  isAdminAuthenticated: mocks.isAdminAuthenticated,
}));
vi.mock("@/lib/admin-analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin-analytics")>();
  return { ...actual, loadExportRows: mocks.loadExportRows };
});

import { AdminDataSetupError } from "@/lib/admin-analytics";
import { GET } from "./route";

function request(kind: string) {
  return GET(new Request(`http://localhost/api/admin/export/${kind}`), {
    params: Promise.resolve({ kind }),
  });
}

describe("관리자 CSV 내보내기 Route Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAdminAuthenticated.mockResolvedValue(true);
    mocks.loadExportRows.mockResolvedValue([]);
  });

  it("미인증 요청은 데이터를 조회하지 않고 401로 거절한다", async () => {
    mocks.isAdminAuthenticated.mockResolvedValue(false);

    const response = await request("events");

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.loadExportRows).not.toHaveBeenCalled();
  });

  it("events와 feedback 이외의 종류를 거절한다", async () => {
    const response = await request("products");

    expect(response.status).toBe(400);
    expect(mocks.loadExportRows).not.toHaveBeenCalled();
  });

  it("인증된 요청에 BOM CSV와 다운로드 헤더를 반환한다", async () => {
    mocks.loadExportRows.mockResolvedValue([
      {
        id: 1,
        session_id: "00000000-0000-4000-8000-000000000001",
        event_type: "visit",
        payload: {},
        created_at: "2026-07-11T00:00:00.000Z",
      },
    ]);

    const response = await request("events");
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/csv; charset=utf-8"
    );
    expect(response.headers.get("content-disposition")).toContain(
      "attachment;"
    );
    expect(response.headers.get("content-disposition")).toContain(
      "filename*=UTF-8''"
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3)).startsWith("이벤트 ID")).toBe(
      true
    );
  });

  it("데이터 연결이 없으면 빈 파일 대신 503 안내를 반환한다", async () => {
    mocks.loadExportRows.mockRejectedValue(new AdminDataSetupError());

    const response = await request("feedback");

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Supabase 데이터 연결이 필요합니다.",
    });
  });
});
