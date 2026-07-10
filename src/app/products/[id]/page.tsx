import Link from "next/link";
import { notFound } from "next/navigation";
import { answersQuery, parseAnswers } from "@/lib/reco/answers";
import { evaluateProduct } from "@/lib/reco/engine";
import { getProductById } from "@/lib/products";
import { REVIEW_RISKS } from "@/lib/constants";
import type { Level3 } from "@/lib/reco/types";
import { TrustLine } from "@/components/ProductCard";
import { CostBreakdownBlock } from "@/components/CostBreakdownBlock";
import { TierBadge } from "@/components/TierBadge";
import { BedPlaceholder } from "@/components/BedIllustration";
import { EventOnMount } from "@/components/Track";
import { CompareButton } from "@/components/CompareButton";
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

  const product = await getProductById(id);
  if (!product || product.status !== "public") notFound();

  const answers = parseAnswers(sp);
  const query = answersQuery(answers);
  const rankRaw = first(sp.rank);
  const rank =
    rankRaw && /^[1-9]\d*$/.test(rankRaw) ? Number(rankRaw) : undefined;

  const rec = evaluateProduct(product, answers);
  const p = rec.product;
  const failedChecks = rec.checks.filter((c) => !c.pass);
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
        payload={{ productId: p.id, tier: rec.tier, rank: rank ?? null }}
      />

      {/* 상단 바 */}
      <div className="flex items-center gap-3 px-5 pt-6">
        <Link
          href={`/results?${query}`}
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
              {c.pass ? (
                <CheckCircleIcon
                  size={18}
                  className="mt-px shrink-0 text-leaf-700"
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
                    c.pass ? "text-ink" : "text-coral-700"
                  }`}
                >
                  {c.label}
                </p>
                {c.note && (
                  <p className="mt-0.5 text-[12.5px] leading-snug text-faint">
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

      {/* 7. 리뷰에서 반복된 리스크 */}
      <section className="mx-5 mt-4 rounded-[28px] bg-white p-5 shadow-soft">
        <h3 className="text-[14px] font-extrabold">리뷰에서 반복된 리스크</h3>
        {p.review_risks.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {p.review_risks.map((risk) => (
              <span
                key={risk}
                className="rounded-full bg-honey-50 px-3 py-1.5 text-[12.5px] font-bold text-honey-700"
              >
                {REVIEW_RISKS[risk]}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[13.5px] text-sub">반복 리스크 없음</p>
        )}
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
              {p.scheduled_delivery ? "가능" : "안 됨"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-sub">운반 서비스</dt>
            <dd className="text-right font-semibold">
              {p.carry_service_available ? "제공" : "없음 (문 앞 배송 기준)"}
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
        <CompareButton
          productId={p.id}
          className="flex w-full items-center justify-center gap-1.5 rounded-full border-2 border-peach-200 bg-white py-3.5 text-[15px] font-bold text-coral-700"
        />
        <Link
          href={`/cost-check/${p.id}?${query}`}
          className="flex w-full items-center justify-center gap-1.5 rounded-full border-2 border-coral-400 bg-white py-3.5 text-[15px] font-extrabold text-coral-600"
        >
          우리 집까지 총비용 확인
          <ArrowRightIcon size={15} className="shrink-0" />
        </Link>
        <SellerLinkButton
          productId={p.id}
          rank={rank}
          via="detail"
          label="판매처에서 자세히 보기"
          checkItems={buildCheckItems({
            unknownParts: rec.cost.unknownParts,
            scheduledDelivery: p.scheduled_delivery,
            hasExtraCostRisk: p.review_risks.includes("extra_cost"),
          })}
          className="flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-[#F95B36] to-[#EE4E26] py-4 text-[16px] font-extrabold text-white shadow-cta"
        />
      </div>
    </main>
  );
}
