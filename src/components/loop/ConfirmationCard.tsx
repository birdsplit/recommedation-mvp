"use client";

import { REASON_CHIPS } from "@/lib/constants";
import { CRITERION_LABELS, type CriterionSuggestion } from "@/lib/reco/criteria";

/**
 * 확인 카드 — 누적된 반응 칩이 임계치를 넘으면 후보 목록 맨 위에 뜬다.
 * 예: "하부 청소가 편한 침대가 중요하신가요?" [필수 조건으로] [선호 조건으로] [아니요]
 */
export function ConfirmationCard({
  suggestion,
  onAnswer,
}: {
  suggestion: CriterionSuggestion;
  onAnswer: (answer: "must" | "prefer" | "no") => void;
}) {
  const chipLabel = REASON_CHIPS[suggestion.chip];
  const criterionLabel = suggestion.targetKey
    ? CRITERION_LABELS[suggestion.targetKey]
    : "";

  return (
    <section
      aria-live="polite"
      className="mt-3 rounded-[24px] border-2 border-coral-500 bg-peach-50 p-5 shadow-card"
    >
      <p className="text-[13px] font-bold text-coral-700">
        &lsquo;{chipLabel}&rsquo; 반응이 모였어요
      </p>
      <h2 className="mt-1.5 text-[17px] font-extrabold leading-snug">
        {suggestion.question}
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-sub">
        원하시면 &lsquo;{criterionLabel}&rsquo;을(를) 기준으로 추가해 후보를 다시
        정리해 드려요.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onAnswer("must")}
          className="rounded-full bg-gradient-to-r from-[#C8431B] to-[#A82E0C] py-3.5 text-[15px] font-extrabold text-white shadow-cta"
        >
          필수 조건으로
        </button>
        <button
          type="button"
          onClick={() => onAnswer("prefer")}
          className="rounded-full border-2 border-coral-500 bg-white py-3.5 text-[15px] font-extrabold text-coral-700"
        >
          선호 조건으로
        </button>
      </div>
      <button
        type="button"
        onClick={() => onAnswer("no")}
        className="mt-2 w-full rounded-full py-2.5 text-[14px] font-bold text-faint"
      >
        아니요, 괜찮아요
      </button>
    </section>
  );
}
