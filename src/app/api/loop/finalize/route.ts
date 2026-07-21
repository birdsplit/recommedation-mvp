import { getDataMode } from "@/lib/data-mode";
import { readJsonObject } from "@/lib/http";
import { getPublicCatalog } from "@/lib/products";
import {
  createRecommendationRun,
  LOOP_ALGORITHM_VERSION,
} from "@/lib/recommendation-runs";
import { answersQuery } from "@/lib/reco/answers";
import {
  encodeCriteria,
  isSessionCriteria,
  type LoopRecommendation,
  type SessionCriteria,
} from "@/lib/reco/criteria";
import { evaluatePool, finalizeShortlist } from "@/lib/reco/engine";
import type {
  Answers,
  RecommendResult,
  RelaxSuggestion,
} from "@/lib/reco/types";
import { isUuid } from "@/lib/uuid";

const MAX_BODY_BYTES = 16_384;
const MAX_IDS = 50;

/**
 * 반응 루프(arm B) 최종 후보 확정 — 클라이언트 값을 믿지 않고 서버에서 스냅샷을 새로 만든다.
 * api/recommendations의 검증 강도와 demo/live 분기를 그대로 따른다.
 */

function isAnswers(value: unknown): value is Answers {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    ["big_items", "drawers", "robot_vacuum", "closed", "any"].includes(
      String(row.storage)
    ) &&
    ["self", "friend", "service"].includes(String(row.carry)) &&
    ["self", "friend", "service"].includes(String(row.assembly)) &&
    (row.budget === null ||
      [100000, 200000, 300000].includes(Number(row.budget))) &&
    ["product_only", "total"].includes(String(row.priceBasis)) &&
    ["this_week", "two_weeks", "one_month", "any"].includes(
      String(row.delivery)
    ) &&
    (row.wantsMattress === null || typeof row.wantsMattress === "boolean")
  );
}

function isUuidList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_IDS &&
    value.every((item) => isUuid(item))
  );
}

/**
 * 최종 후보 구성 (서버 권위):
 * (1) 저장한 후보를 풀 순위대로, 제외 제외, 티어 무관 포함 →
 * (2) 저장·제외를 뺀 나머지에서 finalizeShortlist로 최대 3개까지 백필.
 */
function composeShortlist(
  pool: LoopRecommendation[],
  savedIds: string[],
  excludedIds: string[]
): LoopRecommendation[] {
  const savedSet = new Set(savedIds);
  const excludedSet = new Set(excludedIds);
  const saved = pool.filter(
    (rec) => savedSet.has(rec.product.id) && !excludedSet.has(rec.product.id)
  );
  const rest = pool.filter((rec) => !savedSet.has(rec.product.id));
  const backfill = finalizeShortlist(rest, excludedSet).candidates;
  const candidates = [...saved];
  for (const rec of backfill) {
    if (candidates.length >= 3) break;
    if (candidates.some((item) => item.product.id === rec.product.id)) continue;
    candidates.push(rec);
  }
  return candidates.slice(0, 3);
}

export async function POST(req: Request): Promise<Response> {
  const parsed = await readJsonObject(req, MAX_BODY_BYTES);
  if (!parsed.ok) return new Response(null, { status: parsed.status });
  const { answers, criteria, savedIds, excludedIds, session_id, journey_id } =
    parsed.value as {
      answers?: unknown;
      criteria?: unknown;
      savedIds?: unknown;
      excludedIds?: unknown;
      session_id?: unknown;
      journey_id?: unknown;
    };

  if (
    !isAnswers(answers) ||
    !isSessionCriteria(criteria) ||
    !isUuidList(savedIds) ||
    !isUuidList(excludedIds) ||
    !isUuid(session_id) ||
    !isUuid(journey_id)
  ) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const safeCriteria: SessionCriteria = criteria;

  try {
    const catalog = await getPublicCatalog();
    const pool = evaluatePool(catalog.products, answers, safeCriteria);
    const candidates = composeShortlist(pool, savedIds, excludedIds);
    const savedSet = new Set(savedIds);
    const savedInShortlist = candidates
      .filter((rec) => savedSet.has(rec.product.id))
      .map((rec) => rec.product.id);
    const snapshot = {
      candidates,
      totalReviewed: pool.length,
      relaxSuggestions: [] as RelaxSuggestion[],
      savedIds: savedInShortlist,
    };

    if (getDataMode() === "demo") {
      const params = new URLSearchParams(answersQuery(answers));
      const encoded = encodeCriteria(safeCriteria);
      if (encoded) params.set("c", encoded);
      if (savedIds.length > 0) params.set("sv", savedIds.join(","));
      if (excludedIds.length > 0) params.set("ex", excludedIds.join(","));
      return Response.json(
        {
          run_id: null,
          candidate_count: candidates.length,
          results_url: `/browse/shortlist?${params.toString()}`,
          data_mode: "demo",
        },
        { status: 201 }
      );
    }

    const run = await createRecommendationRun({
      sessionId: session_id,
      journeyId: journey_id,
      answers,
      result: snapshot as RecommendResult,
      catalog: catalog.release!,
      mode: "loop",
      criteria: safeCriteria,
      algorithmVersion: LOOP_ALGORITHM_VERSION,
    });
    return Response.json(
      {
        run_id: run.id,
        candidate_count: candidates.length,
        results_url: `/results/${run.id}`,
        catalog_version: run.catalog.version,
        data_mode: "live",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("최종 후보 확정 실패:", error);
    return Response.json({ error: "finalize_unavailable" }, { status: 503 });
  }
}
