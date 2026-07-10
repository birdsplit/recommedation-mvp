import type { Tier } from "@/lib/constants";
import { TIER_LABELS } from "@/lib/constants";
import { CheckIcon, InfoIcon, XCircleIcon } from "./icons";

const TIER_STYLES: Record<Tier, string> = {
  great: "bg-leaf-50 text-leaf-700",
  conditional: "bg-honey-50 text-honey-700",
  not_fit: "bg-[#FCE8E4] text-coral-700",
};

export function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-extrabold ${TIER_STYLES[tier]}`}
    >
      {tier === "great" && <CheckIcon size={12} />}
      {tier === "conditional" && <InfoIcon size={12} />}
      {tier === "not_fit" && <XCircleIcon size={12} />}
      {TIER_LABELS[tier]}
    </span>
  );
}
