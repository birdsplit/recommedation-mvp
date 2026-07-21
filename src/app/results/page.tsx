import Link from "next/link";
import { redirect } from "next/navigation";
import { CreateRecommendationButton } from "@/components/CreateRecommendationButton";
import { ResultsView } from "@/components/ResultsView";
import { isDemoDataMode } from "@/lib/data-mode";
import { getPublicProducts } from "@/lib/products";
import { answersQuery, hasAnswers, parseAnswers } from "@/lib/reco/answers";
import { recommend } from "@/lib/reco/engine";

/** 쿼리 기반 결과는 데모 전용. live에서는 저장된 run을 먼저 생성한다. */
export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const search = await searchParams;
  if (!hasAnswers(search)) redirect("/q/1");

  const answers = parseAnswers(search);
  const query = answersQuery(answers);

  if (!isDemoDataMode()) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col justify-center px-5 py-12">
        <section className="rounded-[28px] bg-white p-6 text-center shadow-card">
          <p className="text-[38px]" aria-hidden="true">🧾</p>
          <h1 className="mt-3 text-[20px] font-extrabold">
            새 결과를 저장해서 만들게요
          </h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-sub">
            실데이터 결과는 당시 카탈로그와 추천 규칙을 함께 저장합니다. 나중에
            다시 열어도 지금 본 후보가 바뀌지 않아요.
          </p>
          <div className="mt-6">
            <CreateRecommendationButton
              answers={answers}
              label="저장된 추천 결과 만들기"
            />
          </div>
          <Link
            href={`/summary?${query}`}
            className="mt-4 inline-block text-[13px] font-bold text-faint"
          >
            조건 요약으로 돌아가기
          </Link>
        </section>
      </main>
    );
  }

  const products = await getPublicProducts();
  const result = recommend(products, answers);
  const catalogDate = products
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
    />
  );
}
