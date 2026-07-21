import type { Recommendation } from "@/lib/reco/types";
import { formatWon } from "@/lib/reco/cost";
import { installationLabel, mattressLabel } from "./ProductCard";

/**
 * 실질 총비용 분해 블록 — ProductCard(화면6)의 비용 분해와 동일 구조.
 * 상품 상세(화면7)와 총비용 확인(화면9)에서 공용으로 사용.
 */
export function CostBreakdownBlock({ rec }: { rec: Recommendation }) {
  const p = rec.product;
  return (
    <div className="rounded-2xl bg-cream px-4 py-3.5">
      <dl className="space-y-1.5 text-[13px]">
        <div className="flex justify-between">
          <dt className="text-sub">상품가</dt>
          <dd className="font-semibold">{formatWon(p.price)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-sub">배송비</dt>
          <dd className="font-semibold">
            {(p.shipping_fee_confidence ?? p.data_confidence) !== "confirmed"
              ? "미확인"
              : p.shipping_fee === 0
                ? "무료"
                : formatWon(p.shipping_fee)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-sub">설치비</dt>
          <dd className="font-semibold">{installationLabel(rec)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-sub">매트리스</dt>
          <dd className="font-semibold">{mattressLabel(rec)}</dd>
        </div>
      </dl>
      <div className="mt-3 flex items-center justify-between border-t border-dashed border-[#E7DBC9] pt-3">
        <span className="text-[13.5px] font-extrabold">예상 총비용</span>
        <span className="text-[20px] font-extrabold text-coral-700">
          {formatWon(rec.cost.knownTotal)}
        </span>
      </div>
      {rec.cost.unknownParts.length > 0 && (
        <p className="mt-1.5 text-right text-[13px] font-medium text-honey-700">
          + {rec.cost.unknownParts.join("·")} 별도 (판매처 확인)
        </p>
      )}
    </div>
  );
}
