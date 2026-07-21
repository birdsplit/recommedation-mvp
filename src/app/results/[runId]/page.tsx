import { notFound } from "next/navigation";
import { ResultsView } from "@/components/ResultsView";
import { getRecommendationRun } from "@/lib/recommendation-runs";
import { answersQuery } from "@/lib/reco/answers";

export default async function StoredResultsPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const run = await getRecommendationRun(runId);
  if (!run) notFound();

  // 반응 루프(arm B) run이면 저장 스냅샷에 담아둔 기준·저장 후보를 loop 프롭으로 넘긴다.
  // oneshot run은 loop 프롭 없이 기존 경로 그대로 렌더된다.
  const snapshotSavedIds = (run.result as { savedIds?: unknown }).savedIds;
  const savedIds = Array.isArray(snapshotSavedIds)
    ? snapshotSavedIds.filter((id): id is string => typeof id === "string")
    : [];
  const loop =
    run.mode === "loop" && run.criteria
      ? { criteria: run.criteria, savedIds }
      : undefined;

  return (
    <ResultsView
      answers={run.answers}
      query={answersQuery(run.answers)}
      result={run.result}
      demoMode={false}
      runId={run.id}
      catalogDate={run.catalog.publishedAt}
      loop={loop}
    />
  );
}
