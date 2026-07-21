import Link from "next/link";
import { ProductCard } from "@/components/ProductCard";
import { CandidateComparison } from "@/components/CandidateComparison";
import { ArrowRightIcon, BackIcon, EditIcon } from "@/components/icons";
import { EventOnMount } from "@/components/Track";
import { RememberAnswers } from "@/components/RememberAnswers";
import { answersQuery, summarizeAnswers } from "@/lib/reco/answers";
import type { Answers, RecommendResult } from "@/lib/reco/types";
import { REVIEW_RISKS } from "@/lib/constants";
import { CRITERION_LABELS, type SessionCriteria } from "@/lib/reco/criteria";
import { formatDateDot } from "@/lib/format";

export function ResultsView({
  answers,
  query,
  result,
  demoMode,
  runId = null,
  catalogDate,
  loop,
}: {
  answers: Answers;
  query: string;
  result: RecommendResult;
  demoMode: boolean;
  runId?: string | null;
  catalogDate: string | null;
  /**
   * 반응 루프(arm B) 최종 후보에서만 전달하는 부가 프롭.
   * 없으면 arm A 기본 렌더와 완전히 동일하다(기본 경로 DOM·클래스 불변).
   */
  loop?: { criteria: SessionCriteria; savedIds: string[] };
}) {
  const { candidates, totalReviewed, relaxSuggestions } = result;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[1080px] pb-12">
      <EventOnMount
        type="results_view"
        runId={runId}
        payload={{
          query,
          candidateIds: candidates.map((candidate) => candidate.product.id),
          candidateCount: candidates.length,
          emptyResult: candidates.length === 0,
          catalogDate,
          ...(loop ? { mode: "loop" } : {}),
        }}
      />
      <RememberAnswers
        query={query}
        candidateIds={candidates.map((candidate) => candidate.product.id)}
      />

      <div className="flex items-center gap-3 px-5 pt-6">
        <Link
          href={`/summary?${query}`}
          aria-label="조건 요약으로 돌아가기"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-soft"
        >
          <BackIcon size={18} />
        </Link>
        <h1 className="text-[18px] font-extrabold">추천 결과</h1>
        {runId && (
          <span className="ml-auto rounded-full bg-leaf-50 px-3 py-1.5 text-[13px] font-extrabold text-leaf-700">
            결과 저장됨
          </span>
        )}
      </div>

      <section className="mx-5 mt-4 rounded-3xl bg-white px-4 py-4 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="mb-2 text-[13px] font-bold text-faint">선택한 조건</p>
            <div className="flex flex-wrap gap-1.5">
              {summarizeAnswers(answers).map((chip) => (
                <span
                  key={chip}
                  className="rounded-full bg-peach-50 px-2.5 py-1 text-[13px] font-semibold text-[#4A4038]"
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>
          <Link
            href={`/summary?${query}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#D9BDAE] px-3 py-1.5 text-[13px] font-bold text-coral-700"
          >
            <EditIcon size={11} />
            수정
          </Link>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-[#F0E5DA] pt-3 text-[13px]">
          <div>
            <dt className="font-semibold text-faint">검토 상품</dt>
            <dd className="mt-0.5 font-extrabold">{totalReviewed}개</dd>
          </div>
          <div>
            <dt className="font-semibold text-faint">카탈로그 확인일</dt>
            <dd className="mt-0.5 font-extrabold">
              {catalogDate ? formatDateDot(catalogDate) : "공개 버전 미확인"}
            </dd>
          </div>
        </dl>
      </section>

      {loop &&
        (loop.criteria.must.length > 0 ||
          loop.criteria.prefer.length > 0 ||
          loop.criteria.tolerated.length > 0) && (
          <section className="mx-5 mt-3 rounded-3xl bg-peach-50 px-4 py-4">
            <p className="text-[13px] font-extrabold text-coral-700">
              회원님이 정한 기준
            </p>
            <div className="mt-2 space-y-2">
              {loop.criteria.must.length > 0 && (
                <CriteriaRow
                  label="필수"
                  items={loop.criteria.must.map((key) => CRITERION_LABELS[key])}
                />
              )}
              {loop.criteria.prefer.length > 0 && (
                <CriteriaRow
                  label="선호"
                  items={loop.criteria.prefer.map(
                    (pref) => CRITERION_LABELS[pref.key]
                  )}
                />
              )}
              {loop.criteria.tolerated.length > 0 && (
                <CriteriaRow
                  label="감당 가능한 단점"
                  items={loop.criteria.tolerated.map((risk) => REVIEW_RISKS[risk])}
                />
              )}
            </div>
          </section>
        )}

      {candidates.length > 0 ? (
        <>
          {loop ? (
            <p
              aria-live="polite"
              className="px-6 pb-1 pt-5 text-[14.5px] leading-relaxed text-sub"
            >
              회원님 반응으로 좁힌{" "}
              <b className="font-extrabold text-coral-700">
                최종 후보 {candidates.length}개
              </b>
              예요. 감수하기로 한 단점과 판매처 확인사항을 함께 정리했어요.
            </p>
          ) : (
            <p
              aria-live="polite"
              className="px-6 pb-1 pt-5 text-[14.5px] leading-relaxed text-sub"
            >
              검토한 침대 {totalReviewed}개 중 불충족 상품을 제외하고{" "}
              <b className="font-extrabold text-coral-700">
                후보 {candidates.length}개
              </b>
              를 정리했어요. 미확인 조건은 후보 안에서 따로 표시합니다.
            </p>
          )}

          <CandidateComparison candidates={candidates} runId={runId} />

          <section
            id="candidate-details"
            aria-labelledby="candidate-details-title"
            className="mt-8 scroll-mt-4"
          >
            <div className="px-5">
              <p className="text-[13px] font-bold text-coral-700">근거를 더 확인해요</p>
              <h2
                id="candidate-details-title"
                className="mt-1 text-[19px] font-extrabold"
              >
                후보별 상세 판단
              </h2>
            </div>
            <div className="mx-5 mt-3 grid gap-4 lg:grid-cols-3">
              {candidates.map((rec, index) => {
                if (!loop) {
                  return (
                    <ProductCard
                      key={rec.product.id}
                      rec={rec}
                      rank={index + 1}
                      candidateCount={candidates.length}
                      query={query}
                      runId={runId}
                      demoMode={demoMode}
                    />
                  );
                }
                const saved = loop.savedIds.includes(rec.product.id);
                const toleratedHere = loop.criteria.tolerated.filter((risk) =>
                  rec.product.review_risks.includes(risk)
                );
                return (
                  <div key={rec.product.id} className="space-y-2">
                    {saved && (
                      <p className="inline-flex items-center rounded-full bg-leaf-50 px-3 py-1 text-[13px] font-extrabold text-leaf-700">
                        저장한 후보
                      </p>
                    )}
                    <ProductCard
                      rec={rec}
                      rank={index + 1}
                      candidateCount={candidates.length}
                      query={query}
                      runId={runId}
                      demoMode={demoMode}
                    />
                    {toleratedHere.length > 0 && (
                      <p className="rounded-2xl bg-leaf-50 px-4 py-2.5 text-[13px] font-semibold leading-relaxed text-leaf-700">
                        감수할 단점 ·{" "}
                        {toleratedHere
                          .map((risk) => REVIEW_RISKS[risk])
                          .join(", ")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : (
        <div
          role="status"
          className="mx-5 mt-6 rounded-[28px] bg-white p-6 text-center shadow-card"
        >
          <p className="text-[38px]">🔍</p>
          <h2 className="mt-2 text-[18px] font-extrabold">
            지금 조건으로 보여드릴 후보가 없어요
          </h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-sub">
            검토한 침대 {totalReviewed}개 중 필수조건을 불충족하지 않으면서
            판단 가능한 상품이 없었어요. 임의의 상품을 대신 추천하지 않습니다.
          </p>
        </div>
      )}

      {relaxSuggestions.length > 0 && (
        <section className="mx-5 mt-4 rounded-[28px] bg-peach-50 p-5">
          <h2 className="text-[14px] font-extrabold text-coral-700">
            {candidates.length === 0
              ? "조건을 조금 바꿨을 때의 후보"
              : `후보가 ${candidates.length}개예요 — 아래 조건을 넓힐 수 있어요`}
          </h2>
          <div className="mt-3 space-y-2">
            {relaxSuggestions.map((suggestion) => (
              <Link
                key={suggestion.label}
                href={`/results?${answersQuery(suggestion.relaxed)}`}
                className="flex items-center justify-between rounded-2xl bg-white px-4 py-3.5 shadow-soft"
              >
                <span className="text-[13.5px] font-bold">
                  {suggestion.label}{" "}
                  <b className="text-coral-700">
                    후보 {suggestion.gained}개 추가
                  </b>
                </span>
                <ArrowRightIcon size={15} className="shrink-0 text-coral-700" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {candidates.length === 0 && relaxSuggestions.length === 0 && (
        <section className="mx-5 mt-4 rounded-[28px] bg-peach-50 p-5">
          <h2 className="text-[14px] font-extrabold text-coral-700">
            조건을 두 곳 이상 넓혀야 후보가 생겨요
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-sub">
            아래에서 가장 조정하기 쉬운 조건부터 바꿔보세요.
          </p>
          <div className="mt-3 space-y-2">
            {[
              { href: `/q/1?${query}`, label: "수납 조건 다시 고르기" },
              { href: `/q/2?${query}`, label: "운반·조립 조건 다시 고르기" },
              { href: `/q/3?${query}`, label: "예산·배송일 넓히기" },
            ].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center justify-between rounded-2xl bg-white px-4 py-3.5 text-[13.5px] font-bold shadow-soft"
              >
                {item.label}
                <ArrowRightIcon size={15} className="shrink-0 text-coral-700" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mt-8 flex items-center justify-center gap-5">
        <a
          href="#candidate-details"
          className="text-[14px] font-bold text-coral-700"
        >
          자세히 비교
        </a>
        <span className="h-3 w-px bg-[#EADFD2]" />
        <Link
          href={runId ? `/feedback?run=${runId}` : `/feedback?${query}`}
          className="text-[14px] font-bold text-faint"
        >
          사용 후기 남기기
        </Link>
      </div>
    </main>
  );
}

/** 반응 루프(arm B) 기준 요약 한 줄 — loop 프롭이 있을 때만 렌더된다. */
function CriteriaRow({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[12px] font-extrabold text-faint">{label}</span>
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full bg-white px-2.5 py-1 text-[13px] font-semibold text-[#4A4038]"
        >
          {item}
        </span>
      ))}
    </div>
  );
}
