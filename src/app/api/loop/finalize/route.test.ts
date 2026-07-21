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
  LOOP_ALGORITHM_VERSION: "reaction-loop-2026-07-v1",
}));

import { POST } from "./route";
import { makeProduct } from "@/lib/reco/__tests__/fixtures";
import { DEFAULT_ANSWERS } from "@/lib/reco/answers";
import { decodeCriteria, type SessionCriteria } from "@/lib/reco/criteria";
import type { RecommendResult } from "@/lib/reco/types";

const ids = {
  session_id: "00000000-0000-4000-8000-000000000041",
  journey_id: "00000000-0000-4000-8000-000000000042",
};

const eligibleA = makeProduct({ name: "적합 A", price: 100000 });
const eligibleB = makeProduct({ name: "적합 B", price: 110000 });
const eligibleC = makeProduct({ name: "적합 C", price: 120000 });
// 직접 운반 불가 → carry(self) 불충족 → not_fit 이지만 저장 시 포함되어야 한다
const savedNotFit = makeProduct({
  name: "저장-비추천",
  carry_difficulty: "hard",
  carry_service_available: false,
});

const criteria: SessionCriteria = {
  must: ["under_bed_clean"],
  prefer: [{ key: "low_total_cost", weight: 2, origin: "like_price" }],
  tolerated: ["squeak"],
};

function request(body: unknown): Request {
  return new Request("http://localhost/api/loop/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function lastRunInput() {
  const call = mocks.createRecommendationRun.mock.calls.at(-1);
  return call?.[0] as {
    mode?: string;
    criteria?: SessionCriteria;
    algorithmVersion?: string;
    result: RecommendResult & { savedIds?: string[] };
    catalog?: { id: string };
  };
}

beforeEach(() => {
  delete process.env.DATA_MODE;
  vi.clearAllMocks();
  mocks.getPublicCatalog.mockResolvedValue({
    products: [eligibleA, eligibleB, eligibleC, savedNotFit],
    release: null,
  });
});

describe("POST /api/loop/finalize", () => {
  it("demo에서는 후보를 저장하지 않고 shortlist URL을 만든다 (기준 왕복 포함)", async () => {
    const response = await POST(
      request({
        ...ids,
        answers: DEFAULT_ANSWERS,
        criteria,
        savedIds: [eligibleA.id],
        excludedIds: [eligibleB.id],
      })
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({ run_id: null, data_mode: "demo" });
    expect(body.results_url).toContain("/browse/shortlist?");
    expect(mocks.createRecommendationRun).not.toHaveBeenCalled();

    const params = new URLSearchParams(body.results_url.split("?")[1]);
    expect(decodeCriteria(params.get("c") ?? undefined)).toEqual(criteria);
    expect(params.get("sv")).toBe(eligibleA.id);
    expect(params.get("ex")).toBe(eligibleB.id);
  });

  it("live에서는 mode=loop·기준·알고리즘 버전으로 run을 저장한다", async () => {
    process.env.DATA_MODE = "live";
    const release = {
      id: "10000000-0000-4000-8000-000000000001",
      version: "2026-07-27.1",
      publishedAt: "2026-07-27T00:00:00.000Z",
    };
    mocks.getPublicCatalog.mockResolvedValue({
      products: [eligibleA, eligibleB, eligibleC, savedNotFit],
      release,
    });
    mocks.createRecommendationRun.mockImplementation(async (input) => ({
      id: "20000000-0000-4000-8000-000000000001",
      journeyId: ids.journey_id,
      answers: input.answers,
      result: input.result,
      algorithmVersion: input.algorithmVersion,
      mode: input.mode,
      criteria: input.criteria,
      catalog: input.catalog,
      createdAt: "2026-07-27T00:00:00.000Z",
    }));

    const response = await POST(
      request({
        ...ids,
        answers: DEFAULT_ANSWERS,
        criteria,
        savedIds: [eligibleA.id],
        excludedIds: [],
      })
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      run_id: "20000000-0000-4000-8000-000000000001",
      results_url: "/results/20000000-0000-4000-8000-000000000001",
      data_mode: "live",
    });
    expect(mocks.createRecommendationRun).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "loop",
        criteria,
        algorithmVersion: "reaction-loop-2026-07-v1",
        catalog: release,
      })
    );
  });

  it("저장한 후보는 비추천이라도 최종 후보에 포함되고 나머지는 백필된다", async () => {
    process.env.DATA_MODE = "live";
    mocks.getPublicCatalog.mockResolvedValue({
      products: [eligibleA, eligibleB, eligibleC, savedNotFit],
      release: { id: "10000000-0000-4000-8000-000000000002", version: "v", publishedAt: "2026-07-27T00:00:00.000Z" },
    });
    mocks.createRecommendationRun.mockResolvedValue({
      id: "20000000-0000-4000-8000-000000000002",
      catalog: { version: "v" },
    });

    await POST(
      request({
        ...ids,
        answers: DEFAULT_ANSWERS,
        // 비추천을 만드는 필수 기준은 없이(criteria 비움) carry 불충족만 반영
        criteria: { must: [], prefer: [], tolerated: [] },
        savedIds: [savedNotFit.id],
        excludedIds: [],
      })
    );
    const input = lastRunInput();
    const candidateIds = input.result.candidates.map((c) => c.product.id);
    expect(candidateIds).toContain(savedNotFit.id);
    expect(candidateIds).toHaveLength(3);
    // 저장한 비추천 외에 적합 후보가 백필되었다
    expect(candidateIds.filter((id) => id !== savedNotFit.id).length).toBe(2);
    // 스냅샷에 저장 표시가 남는다
    expect(input.result.savedIds).toContain(savedNotFit.id);
  });

  it("제외한 후보는 절대 최종 후보에 들어가지 않는다", async () => {
    process.env.DATA_MODE = "live";
    mocks.getPublicCatalog.mockResolvedValue({
      products: [eligibleA, eligibleB, eligibleC, savedNotFit],
      release: { id: "10000000-0000-4000-8000-000000000003", version: "v", publishedAt: "2026-07-27T00:00:00.000Z" },
    });
    mocks.createRecommendationRun.mockResolvedValue({
      id: "20000000-0000-4000-8000-000000000003",
      catalog: { version: "v" },
    });

    await POST(
      request({
        ...ids,
        answers: DEFAULT_ANSWERS,
        criteria: { must: [], prefer: [], tolerated: [] },
        savedIds: [],
        excludedIds: [eligibleA.id],
      })
    );
    const candidateIds = lastRunInput().result.candidates.map(
      (c) => c.product.id
    );
    expect(candidateIds).not.toContain(eligibleA.id);
  });

  it("잘못된 answers·criteria·id는 거절한다", async () => {
    const badAnswers = await POST(
      request({ ...ids, answers: {}, criteria, savedIds: [], excludedIds: [] })
    );
    expect(badAnswers.status).toBe(400);

    const badCriteria = await POST(
      request({
        ...ids,
        answers: DEFAULT_ANSWERS,
        criteria: { must: "nope" },
        savedIds: [],
        excludedIds: [],
      })
    );
    expect(badCriteria.status).toBe(400);

    const badIds = await POST(
      request({
        ...ids,
        answers: DEFAULT_ANSWERS,
        criteria,
        savedIds: ["not-a-uuid"],
        excludedIds: [],
      })
    );
    expect(badIds.status).toBe(400);
  });
});
