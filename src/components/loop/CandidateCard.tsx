"use client";

import { STORAGE_TYPE_LABELS } from "@/lib/constants";
import { formatWon } from "@/lib/reco/cost";
import type { LoopRecommendation, ReactionKind } from "@/lib/reco/criteria";
import type { Product } from "@/lib/reco/types";
import { TierBadge } from "@/components/TierBadge";
import { CheckCircleIcon, WarnIcon } from "@/components/icons";

/** 카드용 경량 메타 칩 — ProductCard의 상세 칩과 달리 한 줄 요약만 만든다. */
function miniChips(p: Product): string[] {
  const chips: string[] = [STORAGE_TYPE_LABELS[p.storage_type]];
  if (p.robot_vacuum_fit === "ok") {
    chips.push("로봇청소기 가능");
  } else if (p.storage_type === "legs_open") {
    chips.push("하부 개방");
  } else if (p.dust_blocking === "high") {
    chips.push("하부 막힘");
  } else if (p.cleaning_ease === "easy") {
    chips.push("청소 쉬움");
  }
  chips.push(`배송 ${p.delivery_days_min}~${p.delivery_days_max}일`);
  return chips;
}

const REACTION_META: Record<
  Exclude<ReactionKind, "exclude">,
  { badge: string; className: string }
> = {
  save: { badge: "저장한 후보", className: "bg-leaf-50 text-leaf-700" },
  hold: { badge: "보류한 후보", className: "bg-honey-50 text-honey-700" },
};

/** 반응 루프 후보 카드 (콤팩트) — 저장/보류/제외 반응을 받는다. */
export function CandidateCard({
  rec,
  reaction,
  marker,
  onReact,
  onClearReaction,
}: {
  rec: LoopRecommendation;
  /** 확정된 반응 (제외는 목록에서 빠지므로 여기선 save/hold/null만) */
  reaction: "save" | "hold" | null;
  /** 재정렬 직후 한 렌더 동안 표시하는 순위 이동 표식 */
  marker?: "up" | "down" | null;
  onReact: (kind: ReactionKind) => void;
  onClearReaction: () => void;
}) {
  const p = rec.product;
  const unknownCount = rec.cost.unknownParts.length;
  const meta = reaction ? REACTION_META[reaction] : null;

  return (
    <article
      className={`rounded-[24px] bg-white p-4 shadow-card ${
        reaction ? "ring-2 ring-coral-400/40" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <TierBadge tier={rec.tier} />
        <div className="flex items-center gap-1.5">
          {marker && (
            <span
              aria-hidden="true"
              className={`text-[13px] font-extrabold ${
                marker === "up" ? "text-leaf-700" : "text-faint"
              }`}
            >
              {marker === "up" ? "▲" : "▼"}
            </span>
          )}
          {meta && (
            <span
              className={`rounded-full px-2.5 py-1 text-[12px] font-extrabold ${meta.className}`}
            >
              {meta.badge}
            </span>
          )}
        </div>
      </div>

      <div className="mt-3">
        <h3 className="text-[16px] font-extrabold leading-snug">{p.name}</h3>
        <p className="mt-0.5 text-[13px] font-medium text-faint">
          {p.seller_name}
        </p>
      </div>

      <p className="mt-2 text-[15px] font-extrabold text-coral-700">
        총비용 {formatWon(rec.cost.knownTotal)}
        {unknownCount > 0 && (
          <span className="ml-1.5 text-[12px] font-bold text-honey-700">
            별도 {unknownCount}건
          </span>
        )}
      </p>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {miniChips(p).map((chip) => (
          <span
            key={chip}
            className="rounded-full border border-[#EADFD2] px-2.5 py-1 text-[12px] font-medium text-sub"
          >
            {chip}
          </span>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <CheckCircleIcon size={16} className="mt-px shrink-0 text-leaf-700" />
        <p className="text-[13px] font-semibold leading-relaxed">
          {rec.fitReasons[0]?.text ?? "선택 조건과 맞는 근거를 더 확인해야 해요."}
        </p>
      </div>
      <div className="mt-2 flex gap-2">
        <WarnIcon size={16} className="mt-px shrink-0 text-honey-700" />
        <p className="text-[13px] font-semibold leading-relaxed text-honey-700">
          {rec.cautions[0]?.text ?? "구매 전에 판매 조건을 다시 확인해 주세요."}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <ReactionButton
          active={reaction === "save"}
          activeClass="border-leaf-700 bg-leaf-50 text-leaf-700"
          label="저장"
          onClick={() =>
            reaction === "save" ? onClearReaction() : onReact("save")
          }
        />
        <ReactionButton
          active={reaction === "hold"}
          activeClass="border-honey-700 bg-honey-50 text-honey-700"
          label="보류"
          onClick={() =>
            reaction === "hold" ? onClearReaction() : onReact("hold")
          }
        />
        <ReactionButton
          active={false}
          activeClass=""
          label="제외"
          onClick={() => onReact("exclude")}
        />
      </div>
    </article>
  );
}

function ReactionButton({
  active,
  activeClass,
  label,
  onClick,
}: {
  active: boolean;
  activeClass: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border-2 py-2.5 text-[14px] font-extrabold transition-colors ${
        active ? activeClass : "border-[#EADFD2] bg-white text-sub"
      }`}
    >
      {label}
    </button>
  );
}
