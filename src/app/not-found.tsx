import Link from "next/link";
import { BedThumb } from "@/components/BedIllustration";
import { ArrowRightIcon } from "@/components/icons";

/** 404 — 페이지를 찾을 수 없음 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 pb-16">
      <div className="w-full rounded-[28px] bg-white p-8 text-center shadow-card">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-peach-50">
          <BedThumb />
        </div>
        <h1 className="mt-4 text-[19px] font-extrabold">
          페이지를 찾을 수 없어요
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-sub">
          상품이 내려갔거나 주소가 바뀌었을 수 있어요.
          <br />
          처음부터 다시 찾아드릴게요.
        </p>
        <Link
          href="/"
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#C8431B] to-[#A82E0C] py-4 text-[16px] font-extrabold text-white shadow-cta"
        >
          홈으로 가기
          <ArrowRightIcon size={16} />
        </Link>
      </div>
    </main>
  );
}
