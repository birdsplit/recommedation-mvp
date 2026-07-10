"use client";

import { useEffect } from "react";
import Link from "next/link";

/** 전역 에러 화면 — 에러 상세는 사용자에게 노출하지 않는다 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 사용자에게는 노출하지 않고 콘솔에만 남긴다
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 pb-16">
      <div className="w-full rounded-[28px] bg-white p-8 text-center shadow-card">
        <p className="text-[38px]">😵</p>
        <h1 className="mt-2 text-[19px] font-extrabold">
          잠시 문제가 생겼어요
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-sub">
          일시적인 오류일 수 있어요.
          <br />
          잠깐 뒤에 다시 시도해주세요.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-6 w-full rounded-full bg-gradient-to-r from-[#F95B36] to-[#EE4E26] py-4 text-[16px] font-extrabold text-white shadow-cta"
        >
          다시 시도하기
        </button>
        <Link
          href="/"
          className="mt-3 block w-full rounded-full py-3 text-[14px] font-bold text-faint"
        >
          처음으로 돌아가기
        </Link>
      </div>
    </main>
  );
}
