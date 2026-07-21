"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalIcon } from "./icons";
import { useDataMode } from "./AppFrame";

/**
 * "판매처 보기" — 이동 전 확인사항 시트를 띄운 뒤 /go/[id]로 보낸다 (화면10).
 * 실제 outbound_click 기록은 /go/[id] 서버 핸들러가 담당.
 */
export function SellerLinkButton({
  productId,
  rank,
  via,
  runId,
  evidenceId,
  checkItems,
  className,
  label = "판매처 보기",
  disabled = false,
  disabledReason = "예시 상품을 사용하는 데모에서는 판매처 이동을 제공하지 않아요.",
}: {
  productId: string;
  /** 결과 화면에서의 순위 (1~3), 그 외 화면은 생략 */
  rank?: number;
  /** 총비용 확인 화면을 거쳐 왔는지 */
  via?: "cost_check" | "detail" | "results" | "compare" | "source";
  /** 저장된 추천 실행과 판매처 행동을 연결한다. */
  runId?: string | null;
  /** 필드 그룹별 product_evidence id. 출처 열람일 때만 사용한다. */
  evidenceId?: number;
  /** 이동 전 재안내할 확인사항 (기획서 화면10) */
  checkItems: string[];
  className?: string;
  label?: string;
  /** 데모 데이터 등 외부 이동을 허용할 수 없는 상태 */
  disabled?: boolean;
  /** 비활성 이유를 화면과 보조기기에 함께 제공한다. */
  disabledReason?: string;
}) {
  const dataMode = useDataMode();
  const isDisabled = disabled || dataMode === "demo";
  const [open, setOpen] = useState(false);
  const disabledDescriptionId = useId();
  const dialogTitleId = useId();
  const continueRef = useRef<HTMLAnchorElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || isDisabled) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const background = Array.from(document.body.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement &&
        !element.contains(overlayRef.current)
    );
    const backgroundState = background.map((element) => ({
      element,
      inert: element.inert,
      ariaHidden: element.getAttribute("aria-hidden"),
    }));

    for (const element of background) {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    }
    document.body.style.overflow = "hidden";
    continueRef.current?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => !element.hidden);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }

      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    const onFocusIn = (event: FocusEvent) => {
      if (!dialogRef.current?.contains(event.target as Node)) {
        continueRef.current?.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
      document.body.style.overflow = previousOverflow;
      for (const { element, inert, ariaHidden } of backgroundState) {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      }
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isDisabled, open]);

  const destinationPath =
    via === "source" && Number.isInteger(evidenceId)
      ? `/source/${productId}/${evidenceId}`
      : `/go/${productId}`;
  const goHref = `${destinationPath}?${new URLSearchParams({
    ...(rank ? { rank: String(rank) } : {}),
    ...(via ? { via } : {}),
    ...(runId ? { run: runId } : {}),
  }).toString()}`;

  if (isDisabled) {
    return (
      <div className="w-full">
        <button
          type="button"
          disabled
          aria-describedby={disabledDescriptionId}
          className={
            className ??
            "flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-3 text-[14px] font-extrabold"
          }
          style={{
            background: "#E9DED2",
            border: "2px solid #D8C8B9",
            boxShadow: "none",
            color: "#65584C",
          }}
        >
          {label}
          <ExternalIcon size={13} />
        </button>
        <p
          id={disabledDescriptionId}
          className="mt-2 text-center text-[13px] leading-relaxed text-sub"
        >
          {disabledReason}
        </p>
      </div>
    );
  }

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

      {open &&
        createPortal(
          <div
            ref={overlayRef}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
            onClick={() => setOpen(false)}
          >
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={dialogTitleId}
              className="w-full max-w-[430px] rounded-t-[28px] bg-white px-6 pb-8 pt-6"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mx-auto mb-5 h-1.5 w-10 rounded-full bg-[#EADFD2]" />
              <h3 id={dialogTitleId} className="text-[18px] font-extrabold">
                이동 전에 함께 확인할 항목
              </h3>
              <ul className="mt-4 space-y-2.5">
                {checkItems.map((item) => (
                  <li key={item} className="flex gap-2 text-[14px] leading-snug text-sub">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-coral-400" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-4 rounded-2xl bg-cream px-4 py-3 text-[13px] leading-relaxed text-faint">
                판매처와 제휴 관계가 없어요. 클릭 수는 서비스 개선을 위해 익명으로
                기록돼요.
              </p>
              <div className="mt-5 space-y-2.5">
                <a
                  ref={continueRef}
                  href={goHref}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#C8431B] to-[#A82E0C] py-4 text-[17px] font-extrabold text-white shadow-cta"
                >
                  {via === "source" ? "정보 출처 열기" : "판매처에서 자세히 보기"}
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
          </div>,
          document.body
        )}
    </>
  );
}

