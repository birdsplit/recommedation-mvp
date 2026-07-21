import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicCatalog: vi.fn(),
  createRecommendationRun: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/products", () => ({
  getPublicCatalog: mocks.getPublicCatalog,
}));
vi.mock("@/lib/recommendation-runs", () => ({
  createRecommendationRun: mocks.createRecommendationRun,
}));

import { POST } from "./route";
import { makeProduct } from "@/lib/reco/__tests__/fixtures";
import { DEFAULT_ANSWERS } from "@/lib/reco/answers";

const ids = {
  session_id: "00000000-0000-4000-8000-000000000031",
  journey_id: "00000000-0000-4000-8000-000000000032",
};

function request(body: unknown): Request {
  return new Request("http://localhost/api/recommendations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  delete process.env.DATA_MODE;
  vi.clearAllMocks();
  mocks.getPublicCatalog.mockResolvedValue({
    products: [makeProduct()],
    release: null,
  });
});

describe("POST /api/recommendations", () => {
  it("demo에서는 결과 URL을 만들되 run 저장 성공을 위장하지 않는다", async () => {
    const response = await POST(
      request({ ...ids, answers: DEFAULT_ANSWERS })
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({ run_id: null, data_mode: "demo" });
    expect(body.results_url).toContain("/results?");
    expect(mocks.createRecommendationRun).not.toHaveBeenCalled();
  });

  it("상품을 읽은 바로 그 release를 run 저장에 전달한다", async () => {
    process.env.DATA_MODE = "live";
    const release = {
      id: "10000000-0000-4000-8000-000000000001",
      version: "2026-07-27.1",
      publishedAt: "2026-07-27T00:00:00.000Z",
    };
    mocks.getPublicCatalog.mockResolvedValue({
      products: [makeProduct()],
      release,
    });
    mocks.createRecommendationRun.mockImplementation(async (input) => ({
      id: "20000000-0000-4000-8000-000000000001",
      journeyId: ids.journey_id,
      answers: input.answers,
      result: input.result,
      algorithmVersion: "test",
      catalog: input.catalog,
      createdAt: "2026-07-27T00:00:00.000Z",
    }));

    const response = await POST(
      request({ ...ids, answers: DEFAULT_ANSWERS })
    );
    expect(response.status).toBe(201);
    expect(mocks.createRecommendationRun).toHaveBeenCalledWith(
      expect.objectContaining({ catalog: release })
    );
    await expect(response.json()).resolves.toMatchObject({
      run_id: "20000000-0000-4000-8000-000000000001",
      catalog_version: release.version,
      data_mode: "live",
    });
  });

  it("불완전한 answers 또는 식별자는 거절한다", async () => {
    const response = await POST(request({ answers: {}, ...ids }));
    expect(response.status).toBe(400);
  });
});
