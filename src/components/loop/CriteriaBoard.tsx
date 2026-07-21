"use client";

import { useState } from "react";
import Link from "next/link";
import { REVIEW_RISKS, type ReviewRisk } from "@/lib/constants";
import {
  CRITERION_LABELS,
  type CriterionKey,
  type SessionCriteria,
} from "@/lib/reco/criteria";
import {
  budgetLabel,
  combinedAssistanceLabel,
  DELIVERY_ANSWER_LABELS,
} from "@/lib/reco/answers";
import type { Answers } from "@/lib/reco/types";
import { EditIcon } from "@/components/icons";

/**
 * 기준판 — 필수/선호/감당 가능한 단점 버킷을 요약하고, 확정 기준을 제거하거나
 * 리뷰 리스크를 감당 가능한 단점으로 토글한다. 기본 intake 조건은 읽기 전용으로 보여주고
 * "수정" 링크로 /browse/intake로 돌아간다.
 */
export function CriteriaBoard({
  criteria,
  answers,
  intakeQuery,
  poolRisks,
  onRemoveMust,
  onRemovePrefer,
  onToggleTolerated,
}: {
  criteria: SessionCriteria;
  answers: Answers;
  intakeQuery: string;
  poolRisks: ReviewRisk[];
  onRemoveMust: (key: CriterionKey) => void;
  onRemovePrefer: (key: CriterionKey) => void;
  onToggleTolerated: (risk: ReviewRisk) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasCriteria =
    criteria.must.length > 0 ||
    criteria.prefer.length > 0 ||
    criteria.tolerated.length > 0;

  return (
    <section
      aria-label="내가 정한 기준"
      className="sticky top-2 z-20 rounded-[22px] border border-[#E9DED2] bg-white/95 p-4 shadow-soft backdrop-blur"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[14px] font-extrabold">내 기준</h2>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="rounded-full border border-[#EADFD2] px-3 py-1 text-[12px] font-bold text-coral-700"
        >
          {expanded ? "접기" : "기본 조건·단점"}
        </button>
      </div>

      {!hasCriteria && (
        <p className="mt-2 text-[13px] leading-relaxed text-sub">
          아직 정해진 기준이 없어요. 카드에 저장·제외·보류로 반응하면 숨은 기준을
          찾아드려요.
        </p>
      )}

      {criteria.must.length > 0 && (
        <Bucket title="필수">
          {criteria.must.map((key) => (
            <RemovableChip
              key={key}
              label={CRITERION_LABELS[key]}
              tone="must"
              onRemove={() => onRemoveMust(key)}
            />
          ))}
        </Bucket>
      )}

      {criteria.prefer.length > 0 && (
        <Bucket title="선호">
          {criteria.prefer.map((pref) => (
            <RemovableChip
              key={pref.key}
              label={CRITERION_LABELS[pref.key]}
              tone="prefer"
              onRemove={() => onRemovePrefer(pref.key)}
            />
          ))}
        </Bucket>
      )}

      {criteria.tolerated.length > 0 && (
        <Bucket title="감당 가능한 단점">
          {criteria.tolerated.map((risk) => (
            <RemovableChip
              key={risk}
              label={REVIEW_RISKS[risk]}
              tone="tolerated"
              onRemove={() => onToggleTolerated(risk)}
            />
          ))}
        </Bucket>
      )}

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-[#F0E5DA] pt-3">
          <div>
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-extrabold text-faint">기본 조건</p>
              <Link
                href={`/browse/intake?${intakeQuery}`}
                className="inline-flex items-center gap-1 rounded-full border border-[#D9BDAE] px-2.5 py-1 text-[12px] font-bold text-coral-700"
              >
                <EditIcon size={10} />
                수정
              </Link>
            </div>
            <dl className="mt-2 space-y-1 text-[13px]">
              <ReadOnlyRow label="예산" value={budgetLabel(answers)} />
              <ReadOnlyRow
                label="배송"
                value={DELIVERY_ANSWER_LABELS[answers.delivery]}
              />
              <ReadOnlyRow
                label="운반·조립"
                value={combinedAssistanceLabel(answers)}
              />
            </dl>
          </div>

          {poolRisks.length > 0 && (
            <div>
              <p className="text-[12px] font-extrabold text-faint">
                감당할 수 있는 단점 고르기
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {poolRisks.map((risk) => {
                  const active = criteria.tolerated.includes(risk);
                  return (
                    <button
                      key={risk}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onToggleTolerated(risk)}
                      className={`rounded-full border-2 px-3 py-1.5 text-[12.5px] font-bold transition-colors ${
                        active
                          ? "border-leaf-700 bg-leaf-50 text-leaf-700"
                          : "border-[#EADFD2] bg-white text-sub"
                      }`}
                    >
                      {REVIEW_RISKS[risk]} {active ? "· 감당 가능" : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Bucket({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-2.5">
      <p className="text-[12px] font-extrabold text-faint">{title}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

const CHIP_TONES: Record<"must" | "prefer" | "tolerated", string> = {
  must: "bg-peach-50 text-coral-700",
  prefer: "bg-cream text-[#4A4038]",
  tolerated: "bg-leaf-50 text-leaf-700",
};

function RemovableChip({
  label,
  tone,
  onRemove,
}: {
  label: string;
  tone: "must" | "prefer" | "tolerated";
  onRemove: () => void;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-bold ${CHIP_TONES[tone]}`}
    >
      {label}
      <button
        type="button"
        aria-label={`${label} 기준 빼기`}
        onClick={onRemove}
        className="text-[13px] font-extrabold leading-none"
      >
        ✕
      </button>
    </span>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-faint">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  );
}
