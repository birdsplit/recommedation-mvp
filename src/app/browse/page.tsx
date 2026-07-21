import Link from "next/link";
import { redirect } from "next/navigation";
import { EventOnMount } from "@/components/Track";
import { BrowseLoop } from "@/components/loop/BrowseLoop";
import { CatalogUnavailableError, getPublicProducts } from "@/lib/products";
import { answersQuery, hasAnswers, parseAnswers } from "@/lib/reco/answers";
import { EMPTY_CRITERIA } from "@/lib/reco/criteria";
import { evaluatePool } from "@/lib/reco/engine";
import type { Product } from "@/lib/reco/types";

/**
 * 반응 기반 추천(arm B) 후보 둘러보기.
 * intake의 객관적 제약을 answers로 받아 공개 후보 전체를 서버에서 평가하고,
 * 순수한 엔진 결과를 클라이언트 섬(BrowseLoop)에 넘겨 반응·재정렬을 맡긴다.
 */
export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const search = await searchParams;
  if (!hasAnswers(search)) redirect("/browse/intake");

  const answers = parseAnswers(search);
  const query = answersQuery(answers);

  let products: Product[];
  try {
    products = await getPublicProducts();
  } catch (error) {
    if (error instanceof CatalogUnavailableError) {
      return (
        <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col justify-center px-5 py-12">
          <section className="rounded-[28px] bg-white p-6 text-center shadow-card">
            <p className="text-[38px]" aria-hidden="true">
              🗂️
            </p>
            <h1 className="mt-3 text-[20px] font-extrabold">
              지금은 후보를 불러올 수 없어요
            </h1>
            <p className="mt-2 text-[13.5px] leading-relaxed text-sub">
              공개된 실상품 카탈로그가 준비되면 다시 시도할 수 있어요. 조건은
              그대로 유지돼요.
            </p>
            <Link
              href={`/browse/intake?${query}`}
              className="mt-6 inline-block rounded-full border-2 border-coral-500 px-5 py-2.5 text-[14px] font-extrabold text-coral-700"
            >
              조건 다시 고르기
            </Link>
          </section>
        </main>
      );
    }
    throw error;
  }

  const poolSize = evaluatePool(products, answers, EMPTY_CRITERIA).length;

  return (
    <main className="min-h-dvh pb-4">
      <EventOnMount type="browse_view" payload={{ poolSize }} />
      <div className="px-5 pt-6">
        <h1 className="text-[20px] font-extrabold leading-snug">
          현재 검토한 침대 {poolSize}개
        </h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-sub">
          마음에 들면 저장, 아니면 제외·보류로 반응해 주세요. 반응이 모이면 숨은
          기준을 찾아 후보를 다시 정리해 드려요.
        </p>
      </div>
      <BrowseLoop products={products} answers={answers} intakeQuery={query} />
    </main>
  );
}
