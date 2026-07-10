"use client";

import { useRouter } from "next/navigation";
import { track } from "@/lib/track";
import { COMPARE_MAX } from "@/lib/constants";
import { useCompare } from "./useCompare";
import { CheckIcon, PlusIcon } from "./icons";

/** "비교함에 담기" — 담으면 compare_add 기록, 이미 담겼으면 비교함으로 이동 */
export function CompareButton({
  productId,
  className,
}: {
  productId: string;
  className?: string;
}) {
  const { ids, add, has } = useCompare();
  const router = useRouter();
  const added = has(productId);

  const onClick = () => {
    if (added) {
      router.push("/compare");
      return;
    }
    const result = add(productId);
    if (result === "added") {
      track("compare_add", { productId, compareCount: ids.length + 1 });
    } else if (result === "full") {
      alert(`비교함에는 최대 ${COMPARE_MAX}개까지 담을 수 있어요. 비교함에서 하나를 빼주세요.`);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        className ??
        "flex items-center justify-center gap-1.5 rounded-full border-2 border-peach-200 bg-white py-3 text-[14px] font-bold text-coral-700"
      }
    >
      {added ? <CheckIcon size={13} /> : <PlusIcon size={13} />}
      {added ? "비교함에 담김" : "비교함에 담기"}
    </button>
  );
}
