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

  return (
    <ResultsView
      answers={run.answers}
      query={answersQuery(run.answers)}
      result={run.result}
      demoMode={false}
      runId={run.id}
      catalogDate={run.catalog.publishedAt}
    />
  );
}
