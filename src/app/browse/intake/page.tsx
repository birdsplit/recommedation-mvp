"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BackIcon } from "@/components/icons";
import { encodeAnswers } from "@/lib/reco/answers";
import type {
  Answers,
  AssistanceAnswer,
  Budget,
  DeliveryAnswer,
} from "@/lib/reco/types";
import { track } from "@/lib/track";

/**
 * 반응 기반 추천(arm B) 진입 — 객관적 제약만 묻는다.
 * 운반·조립 / 예산 / 배송의 3단계. 수납 조건은 묻지 않고 "any"로 두어
 * 숨은 기준은 뒤의 카드 반응에서 발견한다.
 * 완료 시 Answers를 쿼리로 인코딩해 /browse로 이동한다.
 */

type Option = { code: string; emoji: string; label: string };

const CARRY_OPTIONS: Option[] = [
  { code: "self", emoji: "💪", label: "직접 옮길 수 있어요" },
  { code: "friend", emoji: "🧑‍🤝‍🧑", label: "친구와 함께 옮길 수 있어요" },
  { code: "service", emoji: "🚚", label: "집 안 운반 서비스가 필요해요" },
];

const ASSEMBLY_OPTIONS: Option[] = [
  { code: "self", emoji: "🔧", label: "직접 조립할 수 있어요" },
  { code: "friend", emoji: "🧑‍🤝‍🧑", label: "친구와 함께 조립할 수 있어요" },
  { code: "service", emoji: "🛠️", label: "조립 서비스가 필요해요" },
];

const BUDGETS = [
  { code: "100000", label: "10만원 이하" },
  { code: "200000", label: "20만원 이하" },
  { code: "300000", label: "30만원 이하" },
  { code: "", label: "상관없음" },
];

const BASES = [
  { code: "total", label: "배송·설치비 포함 총비용", badge: "추천" },
  { code: "item", label: "상품가만" },
];

const DELIVERIES = [
  { code: "1w", label: "일주일 안" },
  { code: "2w", label: "2주 안" },
  { code: "1m", label: "한 달 안" },
  { code: "any", label: "상관없음" },
];

const MATTRESS = [
  { code: "1", label: "매트리스도 필요해요" },
  { code: "0", label: "프레임만 필요해요" },
  { code: "", label: "아직 모르겠어요" },
];

const DELIVERY_MAP: Record<string, DeliveryAnswer> = {
  "1w": "this_week",
  "2w": "two_weeks",
  "1m": "one_month",
  any: "any",
};

function OptionButton({
  option,
  selected,
  onClick,
}: {
  option: Option;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex w-full items-center gap-3.5 rounded-3xl border-2 bg-white px-5 py-4 text-left shadow-soft transition-colors ${
        selected ? "border-coral-500" : "border-transparent"
      }`}
    >
      <span className="text-[26px]" aria-hidden>
        {option.emoji}
      </span>
      <span className="block text-[15.5px] font-bold leading-snug">
        {option.label}
      </span>
    </button>
  );
}

function Pill({
  label,
  badge,
  selected,
  onClick,
}: {
  label: string;
  badge?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-full border-2 px-4 py-2.5 text-[13.5px] font-bold transition-colors ${
        selected
          ? "border-coral-500 bg-peach-50 text-coral-700"
          : "border-[#EADFD2] bg-white text-sub"
      }`}
    >
      {label}
      {badge && (
        <span className="ml-1.5 rounded-full bg-coral-700 px-1.5 py-0.5 text-[13px] font-extrabold text-white">
          {badge}
        </span>
      )}
    </button>
  );
}

/** useSearchParams는 정적 프리렌더에서 Suspense 경계가 필요하다 (compare 페이지와 동일 패턴). */
export default function BrowseIntakePage() {
  return (
    <Suspense fallback={null}>
      <BrowseIntakeInner />
    </Suspense>
  );
}

function BrowseIntakeInner() {
  const router = useRouter();
  const sp = useSearchParams();

  const [step, setStep] = useState(1);
  const [carry, setCarry] = useState<AssistanceAnswer | "">(
    (sp.get("ca") as AssistanceAnswer | null) ?? ""
  );
  const [assembly, setAssembly] = useState<AssistanceAnswer | "">(
    (sp.get("a") as AssistanceAnswer | null) ?? ""
  );
  const [budget, setBudget] = useState(sp.get("b") ?? "");
  const [basis, setBasis] = useState(sp.get("pb") === "item" ? "item" : "total");
  const [delivery, setDelivery] = useState(sp.get("d") ?? "");
  const [mattress, setMattress] = useState(sp.get("m") ?? "");

  const goStep = (next: number) => setStep(Math.min(3, Math.max(1, next)));

  const completeStep1 = () => {
    if (!carry || !assembly) return;
    track("question_answer", {
      step: 1,
      answer: { carry, assembly },
      mode: "loop",
    });
    goStep(2);
  };

  const completeStep2 = () => {
    track("question_answer", {
      step: 2,
      answer: { budget: budget || "any", basis },
      mode: "loop",
    });
    goStep(3);
  };

  const answers = useMemo<Answers>(
    () => ({
      storage: "any",
      carry: (carry || "self") as AssistanceAnswer,
      assembly: (assembly || "self") as AssistanceAnswer,
      budget:
        budget === "100000" || budget === "200000" || budget === "300000"
          ? (Number(budget) as Budget)
          : null,
      priceBasis: basis === "item" ? "product_only" : "total",
      delivery: DELIVERY_MAP[delivery] ?? "any",
      wantsMattress: mattress === "1" ? true : mattress === "0" ? false : null,
    }),
    [carry, assembly, budget, basis, delivery, mattress]
  );

  const completeStep3 = () => {
    track("question_answer", {
      step: 3,
      answer: {
        delivery: DELIVERY_MAP[delivery] ?? "any",
        wantsMattress:
          mattress === "1" ? "yes" : mattress === "0" ? "no" : "unset",
      },
      mode: "loop",
    });
    const query = encodeAnswers(answers);
    track("questions_complete", {
      answers: Object.fromEntries(query.entries()),
      mode: "loop",
    });
    router.push(`/browse?${query.toString()}`);
  };

  return (
    <main className="flex min-h-dvh flex-col px-5 pb-10">
      <div className="flex items-center gap-3 pt-6">
        <button
          type="button"
          aria-label="뒤로 가기"
          onClick={() => (step === 1 ? router.push("/") : goStep(step - 1))}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-soft"
        >
          <BackIcon size={18} />
        </button>
        <div className="flex gap-1.5" aria-label={`3개 질문 중 ${step}번째`}>
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={`h-2 rounded-full transition-all ${
                n === step ? "w-6 bg-coral-500" : "w-2 bg-peach-200"
              }`}
            />
          ))}
        </div>
        <span className="ml-auto text-[13px] font-bold text-faint">
          {step} / 3
        </span>
      </div>

      {step === 1 && (
        <>
          <h1 className="pt-7 text-[23px] font-extrabold leading-[1.35]">
            운반과 조립은
            <br />
            어디까지 가능한가요?
          </h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-sub">
            운반은 집 안까지 옮기는 일, 조립은 부품을 침대로 만드는 일이에요.
          </p>

          <fieldset className="mt-5 space-y-3">
            <legend className="mb-2.5 text-[14px] font-extrabold text-faint">
              1. 집 안 운반
            </legend>
            {CARRY_OPTIONS.map((o) => (
              <OptionButton
                key={o.code}
                option={o}
                selected={carry === o.code}
                onClick={() => setCarry(o.code as AssistanceAnswer)}
              />
            ))}
          </fieldset>

          <fieldset className="mt-6 space-y-3">
            <legend className="mb-2.5 text-[14px] font-extrabold text-faint">
              2. 조립
            </legend>
            {ASSEMBLY_OPTIONS.map((o) => (
              <OptionButton
                key={o.code}
                option={o}
                selected={assembly === o.code}
                onClick={() => setAssembly(o.code as AssistanceAnswer)}
              />
            ))}
          </fieldset>

          <p className="sr-only" aria-live="polite">
            {carry && assembly
              ? "운반과 조립 방법을 모두 선택했습니다."
              : "운반과 조립 방법을 각각 선택해 주세요."}
          </p>
          <button
            type="button"
            onClick={completeStep1}
            disabled={!carry || !assembly}
            className="mt-7 w-full rounded-full bg-gradient-to-r from-[#C8431B] to-[#A82E0C] py-[18px] text-[18px] font-extrabold text-white shadow-cta disabled:cursor-not-allowed disabled:opacity-50"
          >
            예산 조건 고르기
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <h1 className="pt-7 text-[23px] font-extrabold leading-[1.35]">
            예산은
            <br />
            어떻게 되나요?
          </h1>

          <fieldset className="mt-6">
            <legend className="mb-2.5 text-[13px] font-extrabold text-faint">
              예산
            </legend>
            <div className="flex flex-wrap gap-2">
              {BUDGETS.map((b) => (
                <Pill
                  key={b.code}
                  label={b.label}
                  selected={budget === b.code}
                  onClick={() => setBudget(b.code)}
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-5">
            <legend className="mb-2.5 text-[13px] font-extrabold text-faint">
              가격은 어떤 기준으로 볼까요?
            </legend>
            <div className="flex flex-wrap gap-2">
              {BASES.map((b) => (
                <Pill
                  key={b.code}
                  label={b.label}
                  badge={b.badge}
                  selected={basis === b.code}
                  onClick={() => setBasis(b.code)}
                />
              ))}
            </div>
            <p className="mt-2.5 text-[13px] leading-relaxed text-sub">
              배송비·설치비·매트리스 가격이 확인되지 않으면 예산 안이라고
              단정하지 않고 &apos;금액 확인 필요&apos;로 표시해요.
            </p>
          </fieldset>

          <button
            type="button"
            onClick={completeStep2}
            className="mt-8 w-full rounded-full bg-gradient-to-r from-[#C8431B] to-[#A82E0C] py-[18px] text-[18px] font-extrabold text-white shadow-cta"
          >
            배송 조건 고르기
          </button>
        </>
      )}

      {step === 3 && (
        <>
          <h1 className="pt-7 text-[23px] font-extrabold leading-[1.35]">
            언제까지
            <br />
            받아야 하나요?
          </h1>

          <fieldset className="mt-6">
            <legend className="mb-2.5 text-[13px] font-extrabold text-faint">
              배송 시기
            </legend>
            <div className="flex flex-wrap gap-2">
              {DELIVERIES.map((d) => (
                <Pill
                  key={d.code}
                  label={d.label}
                  selected={delivery === d.code}
                  onClick={() => setDelivery(d.code)}
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-5">
            <legend className="mb-2.5 text-[13px] font-extrabold text-faint">
              매트리스도 필요한가요? <span className="font-medium">(선택)</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {MATTRESS.map((m) => (
                <Pill
                  key={m.code}
                  label={m.label}
                  selected={mattress === m.code}
                  onClick={() => setMattress(m.code)}
                />
              ))}
            </div>
          </fieldset>

          <button
            type="button"
            onClick={completeStep3}
            className="mt-8 w-full rounded-full bg-gradient-to-r from-[#C8431B] to-[#A82E0C] py-[18px] text-[18px] font-extrabold text-white shadow-cta"
          >
            침대 둘러보기
          </button>
        </>
      )}
    </main>
  );
}
