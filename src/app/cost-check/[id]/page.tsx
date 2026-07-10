import Link from "next/link";
import { notFound } from "next/navigation";
import { answersQuery, parseAnswers } from "@/lib/reco/answers";
import { evaluateProduct } from "@/lib/reco/engine";
import { getProductById } from "@/lib/products";
import { CostBreakdownBlock } from "@/components/CostBreakdownBlock";
import {
  SellerLinkButton,
} from "@/components/SellerLinkButton";
import { buildCheckItems } from "@/lib/check-items";
import { BackIcon, WarnIcon } from "@/components/icons";
import { CostCheckForm } from "./CostCheckForm";

/** 추가비용이 생길 수 있는 경우 — 금액을 계산하지 않고 조건만 안내 (기획서 화면9) */
const EXTRA_COST_CASES = [
  "도서·산간 지역이라 추가 배송비가 붙는 경우",
  "엘리베이터가 없어 계단 운반이 필요한 경우",
  "문 앞이 아니라 방 안까지 운반을 요청하는 경우",
];

/** 화면9 — 총비용·배송 조건 확인 */
export default async function CostCheckPage({
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
  const rec = evaluateProduct(product, answers);
  const p = rec.product;

  const hasExtraCostRisk = p.review_risks.includes("extra_cost");
  const checkItems = buildCheckItems({
    unknownParts: rec.cost.unknownParts,
    scheduledDelivery: p.scheduled_delivery,
    hasExtraCostRisk,
  });

  return (
    <main className="min-h-dvh pb-12">
      {/* 상단 바 */}
      <div className="flex items-center gap-3 px-5 pt-6">
        <Link
          href={`/products/${p.id}?${query}`}
          aria-label="상품 상세로 돌아가기"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-soft"
        >
          <BackIcon size={18} />
        </Link>
        <h1 className="text-[18px] font-extrabold">우리 집까지 총비용 확인</h1>
      </div>

      <p className="mt-2 px-6 text-[13px] leading-snug text-sub">
        {p.name} · {p.seller_name}
      </p>

      {/* ① 확인된 비용 분해 */}
      <section className="mx-5 mt-4 rounded-[28px] bg-white p-5 shadow-soft">
        <h2 className="mb-3 text-[14px] font-extrabold">지금 확인된 비용</h2>
        <CostBreakdownBlock rec={rec} />
        <p className="mt-3 text-[12px] leading-relaxed text-faint">
          여기까지가 판매처 정보로 확인된 금액이에요. 아래 경우에 해당하면
          비용이 더 생길 수 있어요.
        </p>
      </section>

      {/* ② 추가비용이 생길 수 있는 경우 */}
      <section className="mx-5 mt-4 rounded-[28px] bg-white p-5 shadow-soft">
        <h2 className="text-[14px] font-extrabold text-honey-700">
          추가비용이 생길 수 있는 경우
        </h2>
        <ul className="mt-3 space-y-2.5">
          {EXTRA_COST_CASES.map((item) => (
            <li key={item} className="flex gap-2">
              <WarnIcon size={16} className="mt-px shrink-0 text-honey-700" />
              <span className="text-[13.5px] leading-snug text-ink">
                {item}
              </span>
            </li>
          ))}
        </ul>
        {hasExtraCostRisk && (
          <p className="mt-3 rounded-2xl bg-honey-50 px-3.5 py-3 text-[13px] font-bold leading-snug text-honey-700">
            이 상품은 리뷰에 지역 추가 배송비 이야기가 있어요. 주문 전에 우리
            지역 배송비를 꼭 확인하세요.
          </p>
        )}
      </section>

      {/* ③ 판매처에서 최종 확인할 것 */}
      <section className="mx-5 mt-4 rounded-[28px] bg-white p-5 shadow-soft">
        <h2 className="text-[14px] font-extrabold">
          판매처에서 최종 확인할 것
        </h2>
        <ul className="mt-3 space-y-2.5">
          {checkItems.map((item) => (
            <li
              key={item}
              className="flex gap-2 text-[13.5px] leading-snug text-sub"
            >
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-coral-400" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      {/* 조건 입력 폼 (선택) */}
      <CostCheckForm
        productId={p.id}
        knownTotal={rec.cost.knownTotal}
        unknownParts={rec.cost.unknownParts}
        hasExtraCostRisk={hasExtraCostRisk}
        hasCarryService={p.carry_service_available}
        scheduledDelivery={p.scheduled_delivery}
      />

      {/* 하단 — 판매처 이동 */}
      <div className="mx-5 mt-6">
        <SellerLinkButton
          productId={p.id}
          via="cost_check"
          label="판매처에서 자세히 보기"
          checkItems={checkItems}
          className="flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-[#F95B36] to-[#EE4E26] py-4 text-[16px] font-extrabold text-white shadow-cta"
        />
      </div>
    </main>
  );
}
