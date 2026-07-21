import { getDataMode } from "@/lib/data-mode";
import { readJsonObject } from "@/lib/http";
import { getPublicCatalog } from "@/lib/products";
import { createRecommendationRun } from "@/lib/recommendation-runs";
import { answersQuery } from "@/lib/reco/answers";
import { recommend } from "@/lib/reco/engine";
import type { Answers } from "@/lib/reco/types";
import { isUuid } from "@/lib/uuid";

const MAX_BODY_BYTES = 8_192;

function isAnswers(value: unknown): value is Answers {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    ["big_items", "drawers", "robot_vacuum", "closed", "any"].includes(
      String(row.storage)
    ) &&
    ["self", "friend", "service"].includes(String(row.carry)) &&
    ["self", "friend", "service"].includes(String(row.assembly)) &&
    (row.budget === null || [100000, 200000, 300000].includes(Number(row.budget))) &&
    ["product_only", "total"].includes(String(row.priceBasis)) &&
    ["this_week", "two_weeks", "one_month", "any"].includes(
      String(row.delivery)
    ) &&
    (row.wantsMattress === null || typeof row.wantsMattress === "boolean")
  );
}

export async function POST(req: Request): Promise<Response> {
  const parsed = await readJsonObject(req, MAX_BODY_BYTES);
  if (!parsed.ok) return new Response(null, { status: parsed.status });
  const { answers, session_id, journey_id, study_code } = parsed.value as {
    answers?: unknown;
    session_id?: unknown;
    journey_id?: unknown;
    study_code?: unknown;
  };

  if (!isAnswers(answers) || !isUuid(session_id) || !isUuid(journey_id)) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  if (
    study_code !== undefined &&
    study_code !== null &&
    (typeof study_code !== "string" || study_code.length > 80)
  ) {
    return Response.json({ error: "invalid_study_code" }, { status: 400 });
  }

  try {
    const catalog = await getPublicCatalog();
    const products = catalog.products;
    const result = recommend(products, answers);
    const query = answersQuery(answers);

    if (getDataMode() === "demo") {
      return Response.json(
        {
          run_id: null,
          candidate_count: result.candidates.length,
          results_url: `/results?${query}`,
          data_mode: "demo",
        },
        { status: 201 }
      );
    }

    const run = await createRecommendationRun({
      sessionId: session_id,
      journeyId: journey_id,
      answers,
      result,
      catalog: catalog.release!,
      studyCode: typeof study_code === "string" ? study_code : null,
    });
    return Response.json(
      {
        run_id: run.id,
        candidate_count: result.candidates.length,
        results_url: `/results/${run.id}`,
        catalog_version: run.catalog.version,
        data_mode: "live",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("추천 실행 생성 실패:", error);
    return Response.json(
      { error: "recommendation_unavailable" },
      { status: 503 }
    );
  }
}
