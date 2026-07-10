import Link from "next/link";
import { redirect } from "next/navigation";
import {
  answersQuery,
  hasAnswers,
  parseAnswers,
  summarizeAnswers,
} from "@/lib/reco/answers";
import { recommend } from "@/lib/reco/engine";
import { getPublicProducts } from "@/lib/products";
import { ProductCard } from "@/components/ProductCard";
import { ArrowRightIcon, BackIcon, EditIcon } from "@/components/icons";
import { EventOnMount } from "@/components/Track";
import { RememberAnswers } from "@/components/RememberAnswers";

/** 화면6 — 추천 결과 (후보 3개) */
export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  if (!hasAnswers(sp)) redirect("/q/1");

  const answers = parseAnswers(sp);
  const query = answersQuery(answers);
  const products = await getPublicProducts();
  const result = recommend(products, answers);
  const { candidates, totalReviewed, relaxSuggestions } = result;

  return (
    <main className="min-h-dvh pb-12">
      <EventOnMount
        type="results_view"
        payload={{
          query,
          candidateIds: candidates.map((c) => c.product.id),
          emptyResult: candidates.length === 0,
        }}
      />
      <RememberAnswers
        query={query}
        candidateIds={candidates.map((c) => c.product.id)}
      />

      {/* 상단 바 */}
      <div className="flex items-center gap-3 px-5 pt-6">
        <Link
          href={`/summary?${query}`}
          aria-label="조건 요약으로 돌아가기"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-soft"
        >
          <BackIcon size={18} />
        </Link>
        <h1 className="text-[18px] font-extrabold">추천 결과</h1>
      </div>

      {/* 내 조건 요약 바 (§7.2 조건 수정) */}
      <div className="mx-5 mt-4 rounded-3xl bg-white px-4 py-3.5 shadow-soft">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="mb-1.5 text-[11.5px] font-bold text-faint">내 조건</p>
            <div className="flex flex-wrap gap-1.5">
              {summarizeAnswers(answers).map((chip) => (
                <span
                  key={chip}
                  className="rounded-full bg-peach-50 px-2.5 py-1 text-[12px] font-semibold text-[#4A4038]"
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>
          <Link
            href={`/summary?${query}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#F0DACD] px-3 py-1.5 text-[12px] font-bold text-coral-700"
          >
            <EditIcon size={11} />
            수정
          </Link>
        </div>
      </div>

      {candidates.length > 0 ? (
        <>
          <p className="px-6 pb-1 pt-5 text-[14.5px] text-sub">
            검토한 침대 {totalReviewed}개 중 조건에 맞는{" "}
            <b className="font-extrabold text-coral-700">
              {candidates.length}개
            </b>
            를 골랐어요 {candidates.length === 3 ? "🙌" : ""}
          </p>

          <div className="mx-5 mt-3 space-y-4">
            {candidates.map((rec, i) => (
              <ProductCard
                key={rec.product.id}
                rec={rec}
                rank={i + 1}
                query={query}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="mx-5 mt-6 rounded-[28px] bg-white p-6 text-center shadow-card">
          <p className="text-[38px]">🔍</p>
          <h2 className="mt-2 text-[18px] font-extrabold">
            지금 조건에 맞는 침대가 없어요
          </h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-sub">
            검토한 침대 {totalReviewed}개 중 모든 필수조건을 만족하는 상품이
            없었어요. 아무 상품이나 대신 추천하지 않아요 — 대신 조건을 조금
            바꾸면 어떻게 되는지 알려드릴게요.
          </p>
        </div>
      )}

      {/* 조건 완화 제안 (§7.5) */}
      {relaxSuggestions.length > 0 && (
        <div className="mx-5 mt-4 rounded-[28px] bg-peach-50 p-5">
          <p className="text-[14px] font-extrabold text-coral-700">
            {candidates.length === 0
              ? "조건을 조금 바꿔볼까요?"
              : `후보가 ${candidates.length}개뿐이에요 — 이렇게 하면 더 볼 수 있어요`}
          </p>
          <div className="mt-3 space-y-2">
            {relaxSuggestions.map((s) => (
              <Link
                key={s.label}
                href={`/results?${answersQuery(s.relaxed)}`}
                className="flex items-center justify-between rounded-2xl bg-white px-4 py-3.5 shadow-soft"
              >
                <span className="text-[13.5px] font-bold">
                  {s.label}{" "}
                  <b className="text-coral-700">후보 {s.gained}개 추가</b>
                </span>
                <ArrowRightIcon size={15} className="shrink-0 text-coral-700" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 하단 링크 */}
      <div className="mt-8 flex items-center justify-center gap-5">
        <Link
          href={`/compare?${query}`}
          className="text-[14px] font-bold text-coral-700"
        >
          비교함 보기
        </Link>
        <span className="h-3 w-px bg-[#EADFD2]" />
        <Link
          href={`/feedback?${query}`}
          className="text-[14px] font-bold text-faint"
        >
          사용 후기 남기기
        </Link>
      </div>
    </main>
  );
}
