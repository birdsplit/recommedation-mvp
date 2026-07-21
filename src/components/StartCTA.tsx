"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { getAssignedMode, persistMode } from "@/lib/experiment";
import { track } from "@/lib/track";
import { ArrowRightIcon } from "@/components/icons";

/**
 * 랜딩 시작 CTA — SSR에서는 /q/1로 가는 평범한 링크(JS 없이도 동작).
 * 클릭 시 실험 배정을 확정해 loop면 /browse/intake, oneshot면 /q/1로 보낸다.
 * ?mode= 오버라이드는 getAssignedMode가 location.search에서 읽어 처리한다.
 */
export function StartCTA() {
  const router = useRouter();

  const onClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const mode = getAssignedMode();
    persistMode(mode);
    track("start_click", { entry: mode === "loop" ? "browse" : "questions" });
    router.push(mode === "loop" ? "/browse/intake" : "/q/1");
  };

  return (
    <Link
      href="/q/1"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#C8431B] to-[#A82E0C] py-[18px] text-[19px] font-extrabold text-white shadow-cta"
    >
      침대 후보 찾기
      <ArrowRightIcon size={19} />
    </Link>
  );
}
