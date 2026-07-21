"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { track } from "@/lib/track";
import { BackIcon } from "@/components/icons";
import {
  parseAssistanceAnswers,
  type AnswerSearchParams,
} from "@/lib/reco/answers";
import type { AssistanceAnswer } from "@/lib/reco/types";

/**
 * 화면2~4 — 필수 질문 3개.
 * 답변은 쿼리 파라미터로 누적한다: /q/1 → /q/2?s=… → /q/3?s=…&ca=…&a=… → /summary?…
 * 수정 시에는 기존 쿼리를 유지한 채 진입해 선택값이 미리 표시된다.
 */

type Option = { code: string; emoji: string; label: string; desc?: string };

const Q1_OPTIONS: Option[] = [
  { code: "big", emoji: "🧳", label: "겨울옷·이불 같은 큰 짐을 넣고 싶어요", desc: "매트리스를 들어 올리는 리프트업 수납형" },
  { code: "drawer", emoji: "🗄️", label: "자잘한 물건을 서랍에 정리하고 싶어요", desc: "서랍이 달린 수납형" },
  { code: "robot", emoji: "🤖", label: "로봇청소기가 들어가야 해요", desc: "하부가 열린 다리형" },
  { code: "closed", emoji: "🛡️", label: "먼지가 들어가지 않게 막혀 있으면 좋겠어요", desc: "하부가 막힌 구조" },
  { code: "any", emoji: "🙆", label: "상관없어요" },
];

const Q2_CARRY_OPTIONS: Option[] = [
  { code: "self", emoji: "💪", label: "직접 옮길 수 있어요" },
  { code: "friend", emoji: "🧑‍🤝‍🧑", label: "친구와 함께 옮길 수 있어요" },
  {
    code: "service",
    emoji: "🚚",
    label: "집 안 운반 서비스가 필요해요",
  },
];

const Q2_ASSEMBLY_OPTIONS: Option[] = [
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

const HELP: Record<number, { title: string; body: string }> = {
  1: {
    title: "잘 모르겠어요",
    body: "짐이 많으면 수납형(리프트업·서랍), 로봇청소기를 쓰거나 청소를 자주 하면 하부가 열린 다리형이 편해요. 먼지가 걱정되면 하부가 막힌 구조가 좋아요.",
  },
  2: {
    title: "운반과 조립, 뭐가 다른가요?",
    body: "운반은 박스를 집 안(방)까지 옮기는 일, 조립은 부품을 침대로 만드는 일이에요. 침대는 무겁지만 부품이 나눠 오면 혼자 조립할 수 있는 경우가 많아요. 엘리베이터 여부는 결과 화면 뒤에서 따로 확인해요.",
  },
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
      <span>
        <span className="block text-[15.5px] font-bold leading-snug">
          {option.label}
        </span>
        {option.desc && (
          <span className="mt-0.5 block text-[13px] font-medium text-faint">
            {option.desc}
          </span>
        )}
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

export default function QuestionPage() {
  const params = useParams<{ step: string }>();
  const step = Math.min(3, Math.max(1, Number(params.step) || 1));
  const router = useRouter();
  const sp = useSearchParams();
  const initialAssistance = useMemo(
    () =>
      parseAssistanceAnswers(
        Object.fromEntries(sp.entries()) as AnswerSearchParams
      ),
    [sp]
  );

  const [carry, setCarry] = useState<AssistanceAnswer | "">(
    initialAssistance?.carry ?? ""
  );
  const [assembly, setAssembly] = useState<AssistanceAnswer | "">(
    initialAssistance?.assembly ?? ""
  );

  // 질문 3의 로컬 상태 (쿼리의 기존 값으로 초기화 — 수정 시 유지)
  const [budget, setBudget] = useState(sp.get("b") ?? "");
  const [basis, setBasis] = useState(sp.get("pb") ?? "total");
  const [delivery, setDelivery] = useState(sp.get("d") ?? "");
  const [mattress, setMattress] = useState(sp.get("m") ?? "");

  const query = useMemo(() => new URLSearchParams(sp.toString()), [sp]);

  const selectAndGo = (key: "s", code: string, next: string) => {
    query.set(key, code);
    track("question_answer", { step, answer: code });
    router.push(`${next}?${query.toString()}`);
  };

  const completeQ2 = () => {
    if (!carry || !assembly) return;
    query.set("ca", carry);
    query.set("a", assembly);
    query.delete("c");
    track("question_answer", {
      step: 2,
      answer: { carry, assembly },
    });
    router.push(`/q/3?${query.toString()}`);
  };

  const completeQ3 = (skip: boolean) => {
    if (skip) {
      query.delete("b");
      query.set("pb", "total");
      query.set("d", "any");
      query.delete("m");
    } else {
      if (budget) query.set("b", budget);
      else query.delete("b");
      query.set("pb", basis);
      query.set("d", delivery || "any");
      if (mattress) query.set("m", mattress);
      else query.delete("m");
    }
    track("question_answer", {
      step: 3,
      answer: skip
        ? "skipped"
        : { budget: budget || "any", basis, delivery: delivery || "any", mattress: mattress || "unset" },
    });
    track("questions_complete", {
      answers: Object.fromEntries(query.entries()),
    });
    router.push(`/summary?${query.toString()}`);
  };

  const help = HELP[step];

  return (
    <main className="flex min-h-dvh flex-col px-5 pb-10">
      {/* 상단 바 */}
      <div className="flex items-center gap-3 pt-6">
        <button
          type="button"
          aria-label="뒤로 가기"
          onClick={() => router.back()}
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
            침대 밑 공간을
            <br />
            어떻게 쓰고 싶나요?
          </h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-sub">
            아래에서 가장 중요한 한 가지를 골라주세요.
          </p>
          <fieldset className="mt-6 space-y-3">
            <legend className="sr-only">가장 중요한 침대 밑 공간 조건</legend>
            {Q1_OPTIONS.map((o) => (
              <OptionButton
                key={o.code}
                option={o}
                selected={sp.get("s") === o.code}
                onClick={() => selectAndGo("s", o.code, "/q/2")}
              />
            ))}
          </fieldset>
        </>
      )}

      {step === 2 && (
        <>
          <h1 className="pt-7 text-[23px] font-extrabold leading-[1.35]">
            운반과 조립은
            <br />
            어디까지 가능한가요?
          </h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-sub">
            운반은 집 안까지 옮기는 일, 조립은 부품을 침대로 만드는 일이에요.
            각각 골라주세요.
          </p>
          <fieldset className="mt-5 space-y-3">
            <legend className="mb-2.5 text-[14px] font-extrabold text-faint">
              1. 집 안 운반
            </legend>
            {Q2_CARRY_OPTIONS.map((o) => (
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
            {Q2_ASSEMBLY_OPTIONS.map((o) => (
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
            onClick={completeQ2}
            disabled={!carry || !assembly}
            className="mt-7 w-full rounded-full bg-gradient-to-r from-[#C8431B] to-[#A82E0C] py-[18px] text-[18px] font-extrabold text-white shadow-cta disabled:cursor-not-allowed disabled:opacity-50"
          >
            예산과 배송 조건 고르기
          </button>
        </>
      )}

      {step === 3 && (
        <>
          <h1 className="pt-7 text-[23px] font-extrabold leading-[1.35]">
            예산과 필요한 시기는
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
              단정하지 않고, 결과에 &apos;금액 확인 필요&apos;로 표시해요.
            </p>
          </fieldset>

          <fieldset className="mt-5">
            <legend className="mb-2.5 text-[13px] font-extrabold text-faint">
              언제까지 받아야 하나요?
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
              매트리스도 필요한가요?{" "}
              <span className="font-medium">(선택)</span>
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

          <div className="mt-8 space-y-3">
            <button
              type="button"
              onClick={() => completeQ3(false)}
              className="w-full rounded-full bg-gradient-to-r from-[#C8431B] to-[#A82E0C] py-[18px] text-[18px] font-extrabold text-white shadow-cta"
            >
              내 조건 확인하기
            </button>
            <button
              type="button"
              onClick={() => completeQ3(true)}
              className="w-full py-2 text-[14px] font-bold text-faint"
            >
              아직 모르겠어요 — 건너뛰기
            </button>
          </div>
        </>
      )}

      {help && (
        <details className="mt-6 rounded-2xl bg-white px-5 py-4 shadow-soft">
          <summary className="cursor-pointer text-[13.5px] font-bold text-coral-700">
            {help.title}
          </summary>
          <p className="mt-2 text-[13px] leading-relaxed text-sub">{help.body}</p>
        </details>
      )}
    </main>
  );
}
