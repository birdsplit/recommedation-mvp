"use client";

import { useEffect, useId, useRef, useState } from "react";
import { REASON_CHIPS, type ReasonChip } from "@/lib/constants";
import type { ReactionKind } from "@/lib/reco/criteria";

/**
 * 반응 이유 칩 시트 (화면: 카드 반응 후 이유 수집).
 * 제외/보류 → 부정 칩, 저장 → 긍정 칩. 최대 3개까지 선택하고 건너뛸 수 있다.
 * 시트는 반응을 확정만 하고(카드 버튼이 반응 종류를 이미 정함), 닫기(취소)는 반응을 만들지 않는다.
 */

const NEGATIVE_CHIPS: ReasonChip[] = [
  "price_burden",
  "storage_lack",
  "cleaning_worry",
  "assembly_worry",
  "design_dislike",
  "delivery_late",
  "review_anxiety",
];

const POSITIVE_CHIPS: ReasonChip[] = [
  "like_price",
  "like_storage",
  "like_clean",
  "like_design",
];

const MAX_CHIPS = 3;

const COPY: Record<
  ReactionKind,
  { title: string; hint: string; confirm: string }
> = {
  exclude: {
    title: "왜 제외하나요?",
    hint: "이유를 고르면 다음 추천 기준을 더 정확히 찾아드려요. 건너뛰어도 돼요.",
    confirm: "제외하기",
  },
  hold: {
    title: "왜 보류하나요?",
    hint: "이유를 고르면 다음 추천 기준을 더 정확히 찾아드려요. 건너뛰어도 돼요.",
    confirm: "보류하기",
  },
  save: {
    title: "어떤 점이 좋았나요?",
    hint: "좋았던 점을 고르면 비슷한 후보를 앞에 보여드려요. 건너뛰어도 돼요.",
    confirm: "저장하기",
  },
};

export function ReasonChips({
  kind,
  onConfirm,
  onCancel,
}: {
  kind: ReactionKind;
  onConfirm: (chips: ReasonChip[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<ReasonChip[]>([]);
  const titleId = useId();
  const hintId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const copy = COPY[kind];
  const chips = kind === "save" ? POSITIVE_CHIPS : NEGATIVE_CHIPS;

  useEffect(() => {
    sheetRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const toggle = (chip: ReasonChip) => {
    setSelected((prev) =>
      prev.includes(chip)
        ? prev.filter((item) => item !== chip)
        : prev.length >= MAX_CHIPS
          ? prev
          : [...prev, chip]
    );
  };

  const atCap = selected.length >= MAX_CHIPS;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={hintId}
        tabIndex={-1}
        className="w-full max-w-[430px] rounded-t-[28px] bg-white px-6 pb-8 pt-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1.5 w-10 rounded-full bg-[#EADFD2]" />
        <h2 id={titleId} className="text-[18px] font-extrabold">
          {copy.title}
        </h2>
        <p id={hintId} className="mt-1.5 text-[13px] leading-relaxed text-sub">
          {copy.hint}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {chips.map((chip) => {
            const isSelected = selected.includes(chip);
            return (
              <button
                key={chip}
                type="button"
                aria-pressed={isSelected}
                disabled={!isSelected && atCap}
                onClick={() => toggle(chip)}
                className={`rounded-full border-2 px-4 py-2.5 text-[13.5px] font-bold transition-colors disabled:opacity-40 ${
                  isSelected
                    ? "border-coral-500 bg-peach-50 text-coral-700"
                    : "border-[#EADFD2] bg-white text-sub"
                }`}
              >
                {REASON_CHIPS[chip]}
              </button>
            );
          })}
        </div>

        <div className="mt-6 space-y-2.5">
          <button
            type="button"
            onClick={() => onConfirm(selected)}
            className="w-full rounded-full bg-gradient-to-r from-[#C8431B] to-[#A82E0C] py-4 text-[17px] font-extrabold text-white shadow-cta"
          >
            {copy.confirm}
          </button>
          <button
            type="button"
            onClick={() => onConfirm([])}
            className="w-full rounded-full py-3 text-[14px] font-bold text-faint"
          >
            이유 없이 {copy.confirm.slice(0, 2)} · 건너뛰기
          </button>
        </div>
      </div>
    </div>
  );
}
