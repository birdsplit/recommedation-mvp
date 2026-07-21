import Link from "next/link";
import type { Recommendation } from "@/lib/reco/types";
import { REVIEW_RISKS, STORAGE_TYPE_LABELS } from "@/lib/constants";
import { formatWon } from "@/lib/reco/cost";
import { formatDateDot } from "@/lib/format";
import { TierBadge } from "./TierBadge";
import { BedPlaceholder } from "./BedIllustration";
import { CheckCircleIcon, ShieldIcon, WarnIcon } from "./icons";
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
  if (rec.product.unknown_fields?.includes("mattress_included")) {
    return "포함 여부 판매처 확인";
  }
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
    p.unknown_fields?.includes("carry_service_available")
      ? "집 안 운반 방식 확인"
      : p.carry_service_available
        ? "집 안 운반 서비스"
        : "직접 운반 필요"
  );
  if (p.unknown_fields?.includes("assembly_service_available")) {
    chips.push("조립 서비스 여부 확인");
  } else if (p.assembly_service_available) {
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

const EVIDENCE_LABELS: Record<string, string> = {
  commercial: "가격·재고",
  delivery: "배송·설치",
  spec: "규격·구조",
  policy: "반품·보증",
  review: "리뷰 표본",
  catalog: "상품 정보",
};

export function TrustLine({ rec }: { rec: Recommendation }) {
  const p = rec.product;
  return (
    <p className="mt-4 text-center text-[13px] font-medium text-faint">
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
  candidateCount,
  query,
  demoMode,
  runId,
}: {
  rec: Recommendation;
  rank: number;
  candidateCount: number;
  query: string;
  demoMode: boolean;
  runId?: string | null;
}) {
  const p = rec.product;
  const metCount = rec.checks.filter(
    (check) => check.required && check.status === "met"
  ).length;
  const unknownCount = rec.checks.filter(
    (check) => check.required && check.status === "unknown"
  ).length;
  const notMetCount = rec.checks.filter(
    (check) => check.required && check.status === "not_met"
  ).length;
  const detailHref = runId
    ? `/products/${p.id}?run=${encodeURIComponent(runId)}&rank=${rank}`
    : `/products/${p.id}?${query}&rank=${rank}`;

  return (
    <article className="rounded-[28px] bg-white p-5 shadow-card">
      {/* 뱃지 + 순위 */}
      <div className="flex items-center justify-between">
        <TierBadge tier={rec.tier} />
        <span className="text-[13px] font-bold text-faint">
          추천 {rank} / {candidateCount}
        </span>
      </div>

      {/* 상품명 */}
      <div className="mt-4">
        <h3 className="text-[17px] font-extrabold leading-snug">{p.name}</h3>
        <p className="mt-0.5 text-[13px] font-medium text-faint">{p.seller_name}</p>
      </div>

      <div className="mt-3.5 rounded-2xl bg-cream px-4 py-3.5">
        <p className="text-[13px] font-bold text-sub">확인된 총비용</p>
        <p className="mt-0.5 text-[21px] font-extrabold text-coral-700">
          {formatWon(rec.cost.knownTotal)}
        </p>
        {rec.cost.unknownParts.length > 0 && (
          <p className="mt-1.5 text-[13px] font-bold leading-relaxed text-honey-700">
            + {rec.cost.unknownParts.join("·")} 비용 미확인
          </p>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <CheckCircleIcon size={18} className="mt-px shrink-0 text-leaf-700" />
        <p className="text-[13.5px] font-semibold leading-relaxed">
          <span className="font-extrabold text-leaf-700">맞는 이유 · </span>
          {rec.fitReasons[0]?.text ?? "선택 조건과 일치하는 근거를 더 확인해야 해요."}
        </p>
      </div>

      <div className="mt-3 flex gap-2 rounded-2xl bg-honey-50 px-3.5 py-3">
        <WarnIcon size={18} className="mt-px shrink-0 text-honey-700" />
        <p className="text-[13px] font-semibold leading-relaxed text-honey-700">
          <span className="font-extrabold">중요한 위험 · </span>
          {rec.cautions[0]?.text ?? "구매 전에 판매 조건을 다시 확인해 주세요."}
        </p>
      </div>

      {/* 필수조건 충족 */}
      <div className="mt-3 flex items-center justify-center gap-1.5 rounded-full bg-[#F4EDE3] px-4 py-2.5">
        <ShieldIcon size={14} className="text-[#5C4B3E]" />
        <span className="text-[13px] font-extrabold text-[#5C4B3E]">
          충족 {metCount} · 미확인 {unknownCount} · 불충족 {notMetCount}
        </span>
      </div>

      <details className="group mt-4 rounded-2xl border border-[#EADFD2] bg-white px-4 py-3">
        <summary className="cursor-pointer list-none text-center text-[13.5px] font-extrabold text-coral-700">
          비용·근거·출처 펼쳐보기
        </summary>

        <div className="mt-4 flex h-[150px] items-center justify-center overflow-hidden rounded-2xl bg-peach-50">
          {p.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
          ) : (
            <BedPlaceholder label={p.name} />
          )}
        </div>

        <dl className="mt-4 space-y-2 text-[13px]">
          <div className="flex justify-between gap-3"><dt className="text-sub">상품가</dt><dd className="font-semibold">{formatWon(p.price)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-sub">배송비</dt><dd className="text-right font-semibold">{(p.shipping_fee_confidence ?? p.data_confidence) !== "confirmed" ? "미확인" : p.shipping_fee === 0 ? "무료" : formatWon(p.shipping_fee)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-sub">설치비</dt><dd className="text-right font-semibold">{installationLabel(rec)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-sub">매트리스</dt><dd className="text-right font-semibold">{mattressLabel(rec)}</dd></div>
        </dl>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {metaChips(rec).map((chip) => (
            <span key={chip} className="rounded-full border border-[#EADFD2] px-2.5 py-1 text-[13px] font-medium text-sub">
              {chip}
            </span>
          ))}
        </div>

        <ul className="mt-4 space-y-2">
          {rec.checks.map((check) => (
            <li key={check.key} className="flex gap-2 text-[13px] leading-relaxed">
              <span className="shrink-0 font-extrabold">
                {check.status === "met"
                  ? "✓ 충족"
                  : check.status === "unknown"
                    ? "? 미확인"
                    : "× 불충족"}
              </span>
              <span><b>{check.label}</b>{check.note ? ` · ${check.note}` : ""}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 rounded-2xl bg-cream p-3 text-[13px] leading-relaxed text-sub">
          {(p.review_sample_count ?? 0) > 0 ? (
            <>
              <p className="font-extrabold text-ink">
                리뷰 표본 {p.review_sample_count}개 · 재검수 {p.review_rechecked_count ?? 0}개
              </p>
              <p className="mt-1">
                {p.review_risks.length > 0
                  ? p.review_risks
                      .map((risk) => `${REVIEW_RISKS[risk]} ${p.review_risk_counts?.[risk] ?? 0}건`)
                      .join(" · ")
                  : "표본에서 2건 이상 반복된 위험은 없었어요."}
              </p>
            </>
          ) : (
            <p className="font-bold text-honey-700">리뷰 위험 표본은 아직 확인되지 않았어요.</p>
          )}
        </div>

        <div className="mt-4 space-y-2">
          {(p.evidence?.length ?? 0) > 0 ? (
            p.evidence!.map((evidence) => (
              <SellerLinkButton
                key={evidence.id}
                productId={p.id}
                evidenceId={evidence.id}
                via="source"
                runId={runId}
                label={`${EVIDENCE_LABELS[evidence.field_group] ?? evidence.field_group} 출처`}
                disabled={demoMode}
                checkItems={[
                  `${evidence.verified_at}에 ${evidence.verified_by}가 확인한 근거예요.`,
                  "상품 옵션과 확인일이 화면의 정보와 같은지 확인해 주세요.",
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
              disabledReason="예시 데이터의 출처 링크는 제공하지 않아요. 실상품 검수가 끝나면 열립니다."
              checkItems={["상품 옵션과 확인일이 화면의 정보와 같은지 확인해 주세요."]}
            />
          )}
        </div>
        <TrustLine rec={rec} />
      </details>

      {/* 버튼 */}
      <div className="mt-4 space-y-2.5">
        <Link
          href={detailHref}
          className="block w-full rounded-full bg-gradient-to-r from-[#C8431B] to-[#A82E0C] py-4 text-center text-[17px] font-extrabold text-white shadow-cta"
        >
          자세히 판단하기
        </Link>
        <div>
          <SellerLinkButton
            productId={p.id}
            rank={rank}
            via="results"
            runId={runId}
            disabled={demoMode}
            checkItems={buildCheckItems({
              unknownParts: rec.cost.unknownParts,
              scheduledDelivery: p.scheduled_delivery,
              hasExtraCostRisk: p.review_risks.includes("extra_cost"),
            })}
          />
        </div>
      </div>
    </article>
  );
}
