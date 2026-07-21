import "server-only";

import { connection } from "next/server";
import { isLiveDataMode } from "@/lib/data-mode";
import type { PublishedCatalogRelease } from "@/lib/products";
import type { Answers, RecommendResult } from "@/lib/reco/types";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase";
import { isUuid } from "@/lib/uuid";

export const RECOMMENDATION_ALGORITHM_VERSION = "tri-state-2026-07-v1";

export interface CatalogReleaseRef {
  id: string;
  version: string;
  publishedAt: string;
}

export interface StoredRecommendationRun {
  id: string;
  journeyId: string;
  answers: Answers;
  result: RecommendResult;
  algorithmVersion: string;
  catalog: CatalogReleaseRef;
  createdAt: string;
}

type ReleaseRow = {
  id: string;
  version: string;
  published_at: string | null;
};

export async function createRecommendationRun(input: {
  sessionId: string;
  journeyId: string;
  answers: Answers;
  result: RecommendResult;
  catalog: PublishedCatalogRelease;
  studyCode?: string | null;
}): Promise<StoredRecommendationRun> {
  if (!isLiveDataMode()) {
    throw new Error("데모 추천은 영속 추천 실행으로 저장하지 않습니다.");
  }
  if (!isUuid(input.sessionId) || !isUuid(input.journeyId)) {
    throw new Error("추천 실행 식별자가 올바르지 않습니다.");
  }

  if (!isSupabaseConfigured() || !isUuid(input.catalog.id)) {
    throw new Error("추천 실행을 저장할 카탈로그 연결이 올바르지 않습니다.");
  }
  const catalog: CatalogReleaseRef = input.catalog;
  const row = {
    session_id: input.sessionId,
    journey_id: input.journeyId,
    answers: input.answers,
    algorithm_version: RECOMMENDATION_ALGORITHM_VERSION,
    catalog_release_id: catalog.id,
    result_snapshot: input.result,
    candidate_count: input.result.candidates.length,
    study_code:
      typeof input.studyCode === "string" && input.studyCode.trim() !== ""
        ? input.studyCode.trim().slice(0, 80)
        : null,
  };
  const { data, error } = await supabaseAdmin()
    .from("recommendation_runs")
    .insert(row)
    .select("id,created_at")
    .single();
  if (error) throw new Error(`추천 실행 저장 실패: ${error.message}`);

  return {
    id: data.id as string,
    journeyId: input.journeyId,
    answers: input.answers,
    result: input.result,
    algorithmVersion: RECOMMENDATION_ALGORITHM_VERSION,
    catalog,
    createdAt: data.created_at as string,
  };
}

function isStoredResult(value: unknown): value is RecommendResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Partial<RecommendResult>;
  return (
    Array.isArray(row.candidates) &&
    typeof row.totalReviewed === "number" &&
    Array.isArray(row.relaxSuggestions)
  );
}

export async function getRecommendationRun(
  id: string
): Promise<StoredRecommendationRun | null> {
  await connection();
  if (!isUuid(id) || !isLiveDataMode() || !isSupabaseConfigured()) return null;
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("recommendation_runs")
    .select(
      "id,journey_id,answers,algorithm_version,catalog_release_id,result_snapshot,created_at"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`추천 실행 조회 실패: ${error.message}`);
  if (!data || !isStoredResult(data.result_snapshot)) return null;

  const { data: releaseData, error: releaseError } = await db
    .from("catalog_releases")
    .select("id,version,published_at")
    .eq("id", data.catalog_release_id)
    .maybeSingle();
  if (releaseError) {
    throw new Error(`추천 카탈로그 조회 실패: ${releaseError.message}`);
  }
  const release = releaseData as ReleaseRow | null;
  if (!release || !release.published_at) return null;

  return {
    id: data.id as string,
    journeyId: data.journey_id as string,
    answers: data.answers as Answers,
    result: data.result_snapshot,
    algorithmVersion: data.algorithm_version as string,
    catalog: {
      id: release.id,
      version: release.version,
      publishedAt: release.published_at,
    },
    createdAt: data.created_at as string,
  };
}
