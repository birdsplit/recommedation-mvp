import { redirect } from "next/navigation";
import { ResultsView } from "@/components/ResultsView";
import { getPublicProducts } from "@/lib/products";
import { answersQuery, hasAnswers, parseAnswers } from "@/lib/reco/answers";
import {
  decodeCriteria,
  type LoopRecommendation,
} from "@/lib/reco/criteria";
import { evaluatePool, finalizeShortlist } from "@/lib/reco/engine";
import type { RecommendResult } from "@/lib/reco/types";
import { isUuid } from "@/lib/uuid";

/**
 * 반응 루프(arm B) 최종 후보 — demo 확정의 도착지.
 * URL의 answers·기준(c)·저장(sv)·제외(ex)로 서버에서 같은 구성을 재계산해
 * ResultsView(loop 프롭)로 렌더한다.
 */

function firstParam(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

function parseIdList(raw: string | string[] | undefined): string[] {
  const value = firstParam(raw);
  if (!value) return [];
  return value
    .split(",")
    .filter((token) => isUuid(token))
    .slice(0, 50);
}

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

export default async function ShortlistPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const search = await searchParams;
  if (!hasAnswers(search)) redirect("/browse/intake");

  const answers = parseAnswers(search);
  const query = answersQuery(answers);
  const criteria = decodeCriteria(firstParam(search.c));
  const savedIds = parseIdList(search.sv);
  const excludedIds = parseIdList(search.ex);

  const products = await getPublicProducts();
  const pool = evaluatePool(products, answers, criteria);
  const candidates = composeShortlist(pool, savedIds, excludedIds);

  const savedSet = new Set(savedIds);
  const savedInShortlist = candidates
    .filter((rec) => savedSet.has(rec.product.id))
    .map((rec) => rec.product.id);

  const result: RecommendResult = {
    candidates,
    totalReviewed: pool.length,
    relaxSuggestions: [],
  };
  const catalogDate =
    products
      .map((product) => product.last_verified_at)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

  return (
    <ResultsView
      answers={answers}
      query={query}
      result={result}
      demoMode
      catalogDate={catalogDate}
      loop={{ criteria, savedIds: savedInShortlist }}
    />
  );
}
