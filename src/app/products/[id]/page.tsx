import Link from "next/link";
import { notFound } from "next/navigation";
import { answersQuery, parseAnswers } from "@/lib/reco/answers";
import { evaluateProduct } from "@/lib/reco/engine";
import { getProductById } from "@/lib/products";
import { getRecommendationRun } from "@/lib/recommendation-runs";
import { isDemoDataMode } from "@/lib/data-mode";
import { REVIEW_RISKS } from "@/lib/constants";
import { formatDateDot } from "@/lib/format";
import type { Level3, Recommendation } from "@/lib/reco/types";
import { TrustLine } from "@/components/ProductCard";
import { CostBreakdownBlock } from "@/components/CostBreakdownBlock";
import { TierBadge } from "@/components/TierBadge";
import { BedPlaceholder } from "@/components/BedIllustration";
import { EventOnMount } from "@/components/Track";
import {
  SellerLinkButton,
} from "@/components/SellerLinkButton";
import { buildCheckItems } from "@/lib/check-items";
import {
  ArrowRightIcon,
  BackIcon,
  CheckCircleIcon,
  WarnIcon,
  XCircleIcon,
} from "@/components/icons";

/** 분해 편의 표시 라벨 (화면7 섹션 7) */
const DISASSEMBLY_LABELS: Record<Level3, string> = {
  easy: "쉬움 — 이사 때 편해요",
  medium: "보통",
  hard: "어려움 — 이사가 잦다면 부담돼요",
};

const EVIDENCE_LABELS: Record<string, string> = {
  commercial: "가격·재고 근거",
  delivery: "배송·설치 근거",
  spec: "규격·구조 근거",
  policy: "반품·보증 근거",
  review: "리뷰 표본 근거",
  catalog: "상품 정보 근거",
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** 화면7 — 상품 상세 판단 */
export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const runIdRaw = first(sp.run);
  const storedRun = runIdRaw ? await getRecommendationRun(runIdRaw) : null;
  const answers = storedRun?.answers ?? parseAnswers(sp);
  const query = answersQuery(answers);
  const rankRaw = first(sp.rank);
  const rank =
    rankRaw && /^[1-9]\d*$/.test(rankRaw) ? Number(rankRaw) : undefined;

  let rec: Recommendation;
  if (storedRun) {
    const snapshot = storedRun.result.candidates.find(
      (candidate) => candidate.product.id === id
    );
    if (!snapshot) notFound();
    rec = snapshot;
  } else {
    const product = await getProductById(id);
    if (!product || product.status !== "public") notFound();
    rec = evaluateProduct(product, answers);
  }
  const p = rec.product;
  const runId = storedRun?.id ?? null;
  const demoMode = isDemoDataMode();
  const failedChecks = rec.checks.filter(
    (check) => check.required && check.status === "not_met"
  );
  const unknownChecks = rec.checks.filter(
    (check) => check.status === "unknown"
  );
  const mismatchReasons = [
    ...failedChecks.map((c) =>
      c.note ? `${c.label} — ${c.note}` : `${c.label} 조건을 충족하지 못해요.`
    ),
    ...(p.not_recommended_for
      ? [`이런 분께는 맞지 않아요 — ${p.not_recommended_for}`]
      : []),
  ];

  return (
    <main className="min-h-dvh pb-12">
      <EventOnMount
        type="product_detail_view"
        runId={runId}
        payload={{ productId: p.id, tier: rec.tier, rank: rank ?? null }}
      />

      {/* 상단 바 */}
      <div className="flex items-center gap-3 px-5 pt-6">
        <Link
          href={runId ? `/results/${runId}` : `/results?${query}`}
          aria-label="추천 결과로 돌아가기"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-soft"
        >
          <BackIcon size={18} />
        </Link>
        <h1 className="text-[18px] font-extrabold">자세히 판단하기</h1>
      </div>

      {/* 비추천 경고 배너 */}
      {rec.tier === "not_fit" && (
        <div className="mx-5 mt-4 rounded-[28px] bg-[#FCE8E4] p-5">
          <div className="flex items-center gap-2">
            <XCircleIcon size={18} className="shrink-0 text-coral-700" />
            <p className="text-[15px] font-extrabold text-coral-700">
              지금 내 조건과 맞지 않는 상품이에요
            </p>
          </div>
          <ul className="mt-2.5 space-y-1">
            {failedChecks.map((c) => (
              <li
                key={c.key}
                className="flex gap-2 text-[13px] font-semibold text-coral-700"
              >
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-coral-700" />
                {c.label} 조건을 충족하지 못해요
              </li>
            ))}
          </ul>
        </div>
      )}

      {rec.conditionStatus === "unknown" && (
        <div className="mx-5 mt-4 rounded-[28px] bg-honey-50 p-5">
          <div className="flex items-center gap-2">
            <WarnIcon size={18} className="shrink-0 text-honey-700" />
            <p className="text-[15px] font-extrabold text-honey-700">
              확인이 필요한 후보예요
            </p>
          </div>
          <ul className="mt-2.5 space-y-1.5">
            {unknownChecks.map((check) => (
              <li key={check.key} className="text-[13px] font-semibold leading-relaxed text-honey-700">
                ? {check.label}{check.note ? ` · ${check.note}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 1. 상품 헤더 */}
      <div className="mx-5 mt-4 rounded-[28px] bg-white p-5 shadow-card">
        <TierBadge tier={rec.tier} />
        <div className="mt-3">
          <h2 className="text-[20px] font-extrabold leading-snug">{p.name}</h2>
          <p className="mt-0.5 text-[13px] font-medium text-faint">
            {p.seller_name}
          </p>
        </div>
        <div className="mt-3.5 flex h-[170px] items-center justify-center overflow-hidden rounded-2xl bg-peach-50">
          {p.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.image_url}
              alt={p.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <BedPlaceholder label={p.name} />
          )}
        </div>
      </div>

      {/* 2. 내 필수조건 충족표 */}
      <section className="mx-5 mt-4 rounded-[28px] bg-white p-5 shadow-soft">
        <h3 className="text-[14px] font-extrabold">내 필수조건 충족표</h3>
        <ul className="mt-3 space-y-3">
          {rec.checks.map((c) => (
            <li key={c.key} className="flex gap-2.5">
              {c.status === "met" ? (
                <CheckCircleIcon
                  size={18}
                  className="mt-px shrink-0 text-leaf-700"
                />
              ) : c.status === "unknown" ? (
                <WarnIcon
                  size={18}
                  className="mt-px shrink-0 text-honey-700"
                />
              ) : (
                <XCircleIcon
                  size={18}
                  className="mt-px shrink-0 text-coral-600"
                />
              )}
              <div>
                <p
                  className={`text-[14px] font-bold leading-snug ${
                    c.status === "met"
                      ? "text-ink"
                      : c.status === "unknown"
                        ? "text-honey-700"
                        : "text-coral-700"
                  }`}
                >
                  <span className="mr-1 font-extrabold">
                    {c.status === "met"
                      ? "충족 ·"
                      : c.status === "unknown"
                        ? "미확인 ·"
                        : "불충족 ·"}
                  </span>
                  {c.label}
                </p>
                {c.note && (
                  <p className="mt-0.5 text-[13px] leading-snug text-faint">
                    {c.note}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* 3. 나와 맞는 이유 */}
      <section className="mx-5 mt-4 rounded-[28px] bg-white p-5 shadow-soft">
        <h3 className="text-[14px] font-extrabold text-leaf-700">
          나와 맞는 이유
        </h3>
        <ul className="mt-3 space-y-2.5">
          {rec.fitReasons.map((r) => (
            <li key={r.core} className="flex gap-2">
              <CheckCircleIcon
                size={17}
                className="mt-px shrink-0 text-leaf-700"
              />
              <span className="text-[13.5px] leading-snug text-ink">
                {r.text}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* 4. 나와 안 맞는 이유 */}
      <section className="mx-5 mt-4 rounded-[28px] bg-white p-5 shadow-soft">
        <h3 className="text-[14px] font-extrabold text-coral-700">
          나와 안 맞는 이유
        </h3>
        {mismatchReasons.length > 0 ? (
          <ul className="mt-3 space-y-2.5">
            {mismatchReasons.map((reason) => (
              <li key={reason} className="flex gap-2">
                <XCircleIcon
                  size={17}
                  className="mt-px shrink-0 text-coral-600"
                />
                <span className="text-[13.5px] leading-snug text-ink">
                  {reason}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13.5px] leading-relaxed text-sub">
            현재 선택한 필수조건과 뚜렷하게 충돌하는 점은 없어요.
          </p>
        )}
      </section>

      {/* 5. 감당 가능한 리스크 */}
      <section className="mx-5 mt-4 rounded-[28px] bg-white p-5 shadow-soft">
        <h3 className="text-[14px] font-extrabold text-honey-700">
          감당 가능한 리스크
        </h3>
        <div className="mt-3 space-y-2">
          {rec.cautions.map((c) => (
            <div
              key={c.core}
              className="flex gap-2 rounded-2xl bg-honey-50 px-3.5 py-3"
            >
              <WarnIcon size={17} className="mt-px shrink-0 text-honey-700" />
              <span className="text-[13px] font-medium leading-snug text-honey-700">
                {c.text}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 6. 실질 총비용 */}
      <section className="mx-5 mt-4 rounded-[28px] bg-white p-5 shadow-soft">
        <h3 className="mb-3 text-[14px] font-extrabold">실질 총비용</h3>
        <CostBreakdownBlock rec={rec} />
      </section>

      {/* 7. 리뷰 표본과 반복 리스크 */}
      <section className="mx-5 mt-4 rounded-[28px] bg-white p-5 shadow-soft">
        <h3 className="text-[14px] font-extrabold">리뷰 표본과 반복 리스크</h3>
        {(p.review_sample_count ?? 0) > 0 ? (
          <>
            <p className="mt-2 text-[13px] leading-relaxed text-sub">
              표본 {p.review_sample_count}개 · 재검수 {p.review_rechecked_count ?? 0}개
              {p.review_verified_at
                ? ` · ${formatDateDot(p.review_verified_at)} 확인`
                : " · 확인일 미기록"}
            </p>
            {p.review_risks.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.review_risks.map((risk) => (
                  <span
                    key={risk}
                    className="rounded-full bg-honey-50 px-3 py-1.5 text-[13px] font-bold text-honey-700"
                  >
                    {REVIEW_RISKS[risk]} · {p.review_risk_counts?.[risk] ?? 0}건
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[13.5px] text-sub">
                이 표본에서 같은 위험이 2건 이상 반복되지는 않았어요.
              </p>
            )}
          </>
        ) : (
          <p className="mt-2 text-[13.5px] text-honey-700">
            리뷰 위험 표본은 아직 확인되지 않았어요.
          </p>
        )}
      </section>

      <section className="mx-5 mt-4 rounded-[28px] bg-white p-5 shadow-soft">
        <h3 className="text-[14px] font-extrabold">반품·파손·보증 확인</h3>
        <dl className="mt-3 space-y-3 text-[13px] leading-relaxed">
          <div>
            <dt className="font-extrabold text-sub">반품·청약철회</dt>
            <dd className="mt-0.5">{p.return_policy_summary ?? "판매처 확인 필요"}</dd>
          </div>
          <div>
            <dt className="font-extrabold text-sub">배송 파손 절차</dt>
            <dd className="mt-0.5">{p.damage_process_summary ?? "판매처 확인 필요"}</dd>
          </div>
          <div>
            <dt className="font-extrabold text-sub">보증·AS</dt>
            <dd className="mt-0.5">{p.warranty_summary ?? "판매처 확인 필요"}</dd>
          </div>
        </dl>
      </section>

      {/* 8. 배송·설치·운반 */}
      <section className="mx-5 mt-4 rounded-[28px] bg-white p-5 shadow-soft">
        <h3 className="text-[14px] font-extrabold">배송·설치·운반</h3>
        <dl className="mt-3 space-y-2 text-[13.5px]">
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-sub">배송 기간</dt>
            <dd className="text-right font-semibold">
              {p.delivery_days_min}~{p.delivery_days_max}일
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-sub">지정일 배송</dt>
            <dd className="text-right font-semibold">
              {p.unknown_fields?.includes("scheduled_delivery")
                ? "미확인"
                : p.scheduled_delivery
                  ? "가능"
                  : "안 됨"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-sub">운반 서비스</dt>
            <dd className="text-right font-semibold">
              {p.unknown_fields?.includes("carry_service_available")
                ? "미확인"
                : p.carry_service_available
                  ? "제공"
                  : "없음 (문 앞 배송 기준)"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-sub">조립</dt>
            <dd className="text-right font-semibold">
              권장 {p.assembly_people}인
              {p.assembly_tools ? ` · ${p.assembly_tools}` : ""}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-sub">분해 편의</dt>
            <dd className="text-right font-semibold">
              {p.disassembly_ease
                ? DISASSEMBLY_LABELS[p.disassembly_ease]
                : "판매처 확인"}
            </dd>
          </div>
        </dl>
      </section>

      {/* 9. 출처·확인일 */}
      <TrustLine rec={rec} />
      <div className="mx-5 mt-3 space-y-2">
        {(p.evidence?.length ?? 0) > 0 ? (
          p.evidence!.map((evidence) => (
            <SellerLinkButton
              key={evidence.id}
              productId={p.id}
              evidenceId={evidence.id}
              via="source"
              runId={runId}
              label={EVIDENCE_LABELS[evidence.field_group] ?? "정보 출처 열람"}
              disabled={demoMode}
              checkItems={[
                `${evidence.verified_at}에 ${evidence.verified_by}가 확인한 근거예요.`,
                "화면의 옵션명과 판매처 옵션이 같은지 확인해 주세요.",
              ]}
            />
          ))
        ) : (
          <SellerLinkButton
            productId={p.id}
            via="source"
            runId={runId}
            label="정보 출처 열람"
            disabled={demoMode}
            disabledReason="예시 데이터에는 실제 출처 링크가 없어요. 실상품 검수가 끝나면 열립니다."
            checkItems={["화면의 옵션명과 판매처 옵션이 같은지 확인해 주세요."]}
          />
        )}
      </div>

      {/* 10. 최종 판단 */}
      <section className="mx-5 mt-4 rounded-[28px] bg-white p-5 shadow-card">
        <h3 className="text-[14px] font-extrabold text-coral-700">최종 판단</h3>
        <blockquote className="mt-3 rounded-2xl bg-cream px-5 py-4">
          <p className="text-[24px] font-extrabold leading-none text-coral-400">
            &ldquo;
          </p>
          <p className="-mt-1 text-[15.5px] font-bold leading-relaxed text-ink">
            {rec.finalJudgment}
          </p>
        </blockquote>
      </section>

      {/* 행동 버튼 (기획서 화면7 순서) */}
      <div className="mx-5 mt-6 space-y-2.5">
        <Link
          href={`/cost-check/${p.id}?${query}${runId ? `&run=${runId}` : ""}`}
          className="flex w-full items-center justify-center gap-1.5 rounded-full border-2 border-coral-400 bg-white py-3.5 text-[15px] font-extrabold text-coral-600"
        >
          추가비용 가능성 확인
          <ArrowRightIcon size={15} className="shrink-0" />
        </Link>
        <SellerLinkButton
          productId={p.id}
          rank={rank}
          via="detail"
          runId={runId}
          disabled={demoMode}
          label="판매처에서 자세히 보기"
          checkItems={buildCheckItems({
            unknownParts: rec.cost.unknownParts,
            scheduledDelivery: p.scheduled_delivery,
            hasExtraCostRisk: p.review_risks.includes("extra_cost"),
          })}
          className="flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-[#C8431B] to-[#A82E0C] py-4 text-[16px] font-extrabold text-white shadow-cta"
        />
      </div>
    </main>
  );
}
