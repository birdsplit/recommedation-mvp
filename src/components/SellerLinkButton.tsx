"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalIcon } from "./icons";

/**
 * "판매처 보기" — 이동 전 확인사항 시트를 띄운 뒤 /go/[id]로 보낸다 (화면10).
 * 실제 outbound_click 기록은 /go/[id] 서버 핸들러가 담당.
 */
export function SellerLinkButton({
  productId,
  rank,
  via,
  checkItems,
  className,
  label = "판매처 보기",
}: {
  productId: string;
  /** 결과 화면에서의 순위 (1~3), 그 외 화면은 생략 */
  rank?: number;
  /** 총비용 확인 화면을 거쳐 왔는지 */
  via?: "cost_check" | "detail" | "results" | "compare";
  /** 이동 전 재안내할 확인사항 (기획서 화면10) */
  checkItems: string[];
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const continueRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    continueRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  const goHref = `/go/${productId}?${new URLSearchParams({
    ...(rank ? { rank: String(rank) } : {}),
    ...(via ? { via } : {}),
  }).toString()}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "flex items-center justify-center gap-1.5 rounded-full bg-[#F4EDE3] py-3 text-[14px] font-bold text-[#4A4038]"
        }
      >
        {label}
        <ExternalIcon size={13} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="이동 전 확인사항"
            className="w-full max-w-[430px] rounded-t-[28px] bg-white px-6 pb-8 pt-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-5 h-1.5 w-10 rounded-full bg-[#EADFD2]" />
            <h3 className="text-[18px] font-extrabold">
              이동 전에 이것만 확인하세요
            </h3>
            <ul className="mt-4 space-y-2.5">
              {checkItems.map((item) => (
                <li key={item} className="flex gap-2 text-[14px] leading-snug text-sub">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-coral-400" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-4 rounded-2xl bg-cream px-4 py-3 text-[12px] leading-relaxed text-faint">
              판매처와 제휴 관계가 없어요. 클릭 수는 서비스 개선을 위해 익명으로
              기록돼요.
            </p>
            <div className="mt-5 space-y-2.5">
              <a
                ref={continueRef}
                href={goHref}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#F95B36] to-[#EE4E26] py-4 text-[17px] font-extrabold text-white shadow-cta"
              >
                판매처에서 자세히 보기
                <ExternalIcon size={15} />
              </a>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full rounded-full py-3 text-[14px] font-bold text-faint"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

