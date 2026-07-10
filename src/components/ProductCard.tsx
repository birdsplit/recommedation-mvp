import Link from "next/link";
import type { Recommendation } from "@/lib/reco/types";
import { STORAGE_TYPE_LABELS } from "@/lib/constants";
import { formatWon } from "@/lib/reco/cost";
import { formatDateDot } from "@/lib/format";
import { TierBadge } from "./TierBadge";
import { BedPlaceholder } from "./BedIllustration";
import { CheckCircleIcon, ShieldIcon, WarnIcon } from "./icons";
import { CompareButton } from "./CompareButton";
import { SellerLinkButton } from "./SellerLinkButton";
import { buildCheckItems } from "@/lib/check-items";

/** 설치비 표시값 */
export function installationLabel(rec: Recommendation): string {
  const p = rec.product;
  if (p.installation_service === "included") return "포함";
  if (p.installation_service === "none") return "없음 (직접 조립)";
  if (rec.cost.installationNeeded) {
    return rec.cost.installationFee !== null && rec.cost.installationFee > 0
      ? formatWon(rec.cost.installationFee)
      : "판매처 확인";
  }
  return "이용 안 함 (직접 조립)";
}

/** 매트리스 표시값 */
export function mattressLabel(rec: Recommendation): string {
  if (rec.product.mattress_included) return "포함";
  if (rec.cost.mattressNeeded) {
    return rec.cost.mattressPrice !== null
      ? `별도 ${formatWon(rec.cost.mattressPrice)}`
      : "판매처 확인";
  }
  return "미포함";
}

function metaChips(rec: Recommendation): string[] {
  const p = rec.product;
  const chips = [`배송 ${p.delivery_days_min}~${p.delivery_days_max}일`];
  chips.push(STORAGE_TYPE_LABELS[p.storage_type]);
  if (p.robot_vacuum_fit === "ok" && p.under_bed_clearance_cm !== null) {
    chips.push(`하부 ${p.under_bed_clearance_cm}cm 개방`);
  } else if (p.dust_blocking === "high") {
    chips.push("하부 막힘(먼지 차단)");
  }
  chips.push(
    p.carry_service_available ? "집 안 운반 서비스" : "직접 운반 필요"
  );
  if (p.assembly_service_available) {
    chips.push("조립 서비스 가능");
  } else if (p.self_assembly === null) {
    chips.push("조립 조건 판매처 확인");
  } else if (p.self_assembly === "not_possible") {
    chips.push("직접 조립 불가");
  } else {
    const difficulty =
      p.self_assembly === "easy"
        ? "쉬움"
        : p.self_assembly === "medium"
          ? "보통"
          : "어려움";
    chips.push(`직접 조립 ${difficulty} · 권장 ${p.assembly_people}인`);
  }
  return chips;
}

export function TrustLine({ rec }: { rec: Recommendation }) {
  const p = rec.product;
  return (
    <p className="mt-4 text-center text-[11.5px] font-medium text-faint">
      출처: {p.source_note ?? "판매처 확인"} ·{" "}
      {formatDateDot(p.last_verified_at)} 확인
      {p.data_confidence === "estimated" && " · 일부 추정"}
    </p>
  );
}

/** 추천 결과 카드 (화면6) */
export function ProductCard({
  rec,
  rank,
  query,
}: {
  rec: Recommendation;
  rank: number;
  query: string;
}) {
  const p = rec.product;
  const allPass = rec.passCount === rec.totalChecks;

  return (
    <article className="rounded-[28px] bg-white p-5 shadow-card">
      {/* 뱃지 + 순위 */}
      <div className="flex items-center justify-between">
        <TierBadge tier={rec.tier} />
        <span className="text-[11.5px] font-bold text-faint">추천 {rank} / 3</span>
      </div>

      {/* 이미지 */}
      <div className="mt-3.5 flex h-[150px] items-center justify-center overflow-hidden rounded-2xl bg-peach-50">
        {p.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
        ) : (
          <BedPlaceholder label={p.name} />
        )}
      </div>

      {/* 상품명 */}
      <div className="mt-4">
        <h3 className="text-[17px] font-extrabold leading-snug">{p.name}</h3>
        <p className="mt-0.5 text-[13px] font-medium text-faint">{p.seller_name}</p>
      </div>

      {/* 비용 분해 */}
      <div className="mt-3.5 rounded-2xl bg-cream px-4 py-3.5">
        <dl className="space-y-1.5 text-[13px]">
          <div className="flex justify-between">
            <dt className="text-sub">상품가</dt>
            <dd className="font-semibold">{formatWon(p.price)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sub">배송비</dt>
            <dd className="font-semibold">
              {p.shipping_fee === 0 ? "무료" : formatWon(p.shipping_fee)}
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
          <p className="mt-1.5 text-right text-[11.5px] font-medium text-honey-700">
            + {rec.cost.unknownParts.join("·")} 별도 (판매처 확인)
          </p>
        )}
      </div>

      {/* 메타 */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {metaChips(rec).map((chip) => (
          <span
            key={chip}
            className="rounded-full border border-[#EADFD2] px-2.5 py-1 text-[12px] font-medium text-sub"
          >
            {chip}
          </span>
        ))}
      </div>

      {/* 맞는 이유 */}
      <div className="mt-4">
        <p className="mb-2 text-[12px] font-extrabold text-leaf-700">잘 맞는 이유</p>
        <ul className="space-y-2">
          {rec.fitReasons.map((r) => (
            <li key={r.core} className="flex gap-2">
              <CheckCircleIcon size={17} className="mt-px shrink-0 text-leaf-700" />
              <span className="text-[13.5px] leading-snug text-ink">{r.text}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 주의 */}
      {rec.cautions[0] && (
        <div className="mt-3 flex gap-2 rounded-2xl bg-honey-50 px-3.5 py-3">
          <WarnIcon size={17} className="mt-px shrink-0 text-honey-700" />
          <span className="text-[13px] font-medium leading-snug text-honey-700">
            {rec.cautions[0].text}
          </span>
        </div>
      )}

      {/* 필수조건 충족 */}
      <div
        className={`mt-3 flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 ${
          allPass ? "bg-leaf-50" : "bg-honey-50"
        }`}
      >
        <ShieldIcon
          size={14}
          className={allPass ? "text-leaf-700" : "text-honey-700"}
        />
        <span
          className={`text-[12.5px] font-extrabold ${
            allPass ? "text-leaf-700" : "text-honey-700"
          }`}
        >
          {allPass
            ? `내 필수조건 ${rec.totalChecks}개 모두 충족`
            : `내 필수조건 ${rec.passCount}/${rec.totalChecks}개 충족`}
        </span>
      </div>

      {/* 버튼 */}
      <div className="mt-4 space-y-2.5">
        <Link
          href={`/products/${p.id}?${query}&rank=${rank}`}
          className="block w-full rounded-full bg-gradient-to-r from-[#F95B36] to-[#EE4E26] py-4 text-center text-[17px] font-extrabold text-white shadow-cta"
        >
          자세히 판단하기
        </Link>
        <div className="grid grid-cols-2 gap-2.5">
          <CompareButton productId={p.id} />
          <SellerLinkButton
            productId={p.id}
            rank={rank}
            via="results"
            checkItems={buildCheckItems({
              unknownParts: rec.cost.unknownParts,
              scheduledDelivery: p.scheduled_delivery,
              hasExtraCostRisk: p.review_risks.includes("extra_cost"),
            })}
          />
        </div>
      </div>

      <TrustLine rec={rec} />
    </article>
  );
}
