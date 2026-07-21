"use client";

import { useState } from "react";
import { track } from "@/lib/track";
import { formatWon } from "@/lib/reco/cost";
import { CheckCircleIcon } from "@/components/icons";

/**
 * 화면9 — 배송 조건 선택 입력 폼 (전부 선택 사항).
 * 입력값으로 금액을 계산하지 않는다 — 판매처에 물어볼 확인 목록만 만든다 (P1).
 */

const REGIONS = [
  "서울",
  "경기",
  "인천",
  "부산",
  "대구",
  "광주",
  "대전",
  "울산",
  "세종",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
] as const;

type Elevator = "yes" | "no" | "unknown";
type YesNo = "yes" | "no";
type Timing = "this_week" | "two_weeks" | "one_month" | "flexible";

const TIMING_LABELS: Record<Timing, string> = {
  this_week: "이번 주",
  two_weeks: "2주 안",
  one_month: "한 달 안",
  flexible: "여유 있음",
};

function PillGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full border-2 px-3.5 py-2 text-[13px] ${
            value === o.value
              ? "border-coral-400 bg-peach-50 font-extrabold text-coral-700"
              : "border-transparent bg-cream font-bold text-sub"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-[13px] font-extrabold">{label}</legend>
      {children}
    </fieldset>
  );
}

export function CostCheckForm({
  productId,
  knownTotal,
  unknownParts,
  hasExtraCostRisk,
  hasCarryService,
  carryServiceKnown,
  scheduledDelivery,
  scheduledDeliveryKnown,
  runId,
}: {
  productId: string;
  knownTotal: number;
  unknownParts: string[];
  hasExtraCostRisk: boolean;
  hasCarryService: boolean;
  carryServiceKnown: boolean;
  scheduledDelivery: boolean;
  scheduledDeliveryKnown: boolean;
  runId?: string | null;
}) {
  const [region, setRegion] = useState<string | null>(null);
  const [elevator, setElevator] = useState<Elevator | null>(null);
  const [stairs, setStairs] = useState<YesNo | null>(null);
  const [insideCarry, setInsideCarry] = useState<YesNo | null>(null);
  const [timing, setTiming] = useState<Timing | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = () => {
    track(
      "cost_check",
      { productId, region, elevator, stairs, insideCarry, timing },
      { runId }
    );
    setSubmitted(true);
  };

  /** 입력 조건이 반영된 판매처 확인 문장 — 금액은 계산하지 않는다 */
  const adviceItems = (): string[] => {
    const items: string[] = [];
    if (hasExtraCostRisk) {
      items.push(
        region
          ? `이 상품은 지역 추가 배송비 리뷰가 있어요 — ${region} 배송에 추가비가 붙는지 꼭 문의하세요.`
          : "이 상품은 지역 추가 배송비 리뷰가 있어요 — 우리 지역 배송비를 꼭 문의하세요."
      );
    } else if (region) {
      items.push(`${region}까지 추가 배송비가 있는지 문의하세요.`);
    }
    if (elevator === "no" || stairs === "yes") {
      items.push("계단 운반 추가비를 꼭 문의하세요.");
    } else if (elevator === "unknown") {
      items.push(
        "엘리베이터 사용 가능 여부(짐 운반 제한 포함)를 먼저 확인해 두세요."
      );
    }
    if (insideCarry === "yes") {
      items.push(
        !carryServiceKnown
          ? "집 안 운반 서비스 제공 여부와 추가비를 판매처에 확인하세요."
          : hasCarryService
          ? "방 안까지 운반이 기본인지, 추가비가 있는지 문의하세요."
          : "이 상품은 운반 서비스가 없어요 — 문 앞 배송 기준이라 방 안 운반은 직접 해야 할 수 있어요."
      );
    }
    if (timing && timing !== "flexible") {
      items.push(
        `${TIMING_LABELS[timing]}에 받으려면 실제 출고일과 재고를 먼저 확인하세요.`
      );
      items.push(
        !scheduledDeliveryKnown
          ? "지정일 배송 가능 여부를 판매처에 확인하세요."
          : scheduledDelivery
          ? "지정일 배송이 가능한 상품이에요 — 원하는 날짜를 미리 말해두세요."
          : "지정일 배송이 안 되는 상품이에요 — 배송 연락을 기다려야 해요."
      );
    }
    if (items.length === 0) {
      items.push("재고와 실제 배송일이 오늘 기준으로 맞는지 확인하세요.");
    }
    return items;
  };

  return (
    <section className="mx-5 mt-4 rounded-[28px] bg-white p-5 shadow-soft">
      <h2 className="text-[14px] font-extrabold">
        우리 집 조건을 알려주시면 확인 목록을 만들어드려요
      </h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-faint">
        전부 선택 사항이에요. 입력한 조건으로 금액을 계산하지는 않아요 —
        정확한 추가비용은 판매처만 알 수 있어서, 대신 물어볼 것을
        정리해드려요.
      </p>

      <div className="mt-4 space-y-4">
        <Field label="시·도">
          <select
            value={region ?? ""}
            onChange={(e) => setRegion(e.target.value || null)}
            aria-label="시·도 선택"
            className="w-full appearance-none rounded-2xl border-2 border-[#F0DACD] bg-white px-4 py-3 text-[14px] font-bold text-ink"
          >
            <option value="">선택 안 함</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>

        <Field label="엘리베이터">
          <PillGroup<Elevator>
            options={[
              { value: "yes", label: "있음" },
              { value: "no", label: "없음" },
              { value: "unknown", label: "모름" },
            ]}
            value={elevator}
            onChange={setElevator}
          />
        </Field>

        <Field label="계단 운반이 필요해요">
          <PillGroup<YesNo>
            options={[
              { value: "yes", label: "예" },
              { value: "no", label: "아니오" },
            ]}
            value={stairs}
            onChange={setStairs}
          />
        </Field>

        <Field label="집 안까지 운반이 필요해요">
          <PillGroup<YesNo>
            options={[
              { value: "yes", label: "예" },
              { value: "no", label: "아니오" },
            ]}
            value={insideCarry}
            onChange={setInsideCarry}
          />
        </Field>

        <Field label="희망 배송시기">
          <PillGroup<Timing>
            options={(
              ["this_week", "two_weeks", "one_month", "flexible"] as const
            ).map((t) => ({ value: t, label: TIMING_LABELS[t] }))}
            value={timing}
            onChange={setTiming}
          />
        </Field>
      </div>

      <button
        type="button"
        onClick={onSubmit}
        className="mt-5 w-full rounded-full bg-gradient-to-r from-[#C8431B] to-[#A82E0C] py-4 text-[16px] font-extrabold text-white shadow-cta"
      >
        이 조건으로 확인 항목 만들기
      </button>

      {submitted && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="mt-4 rounded-2xl bg-cream p-4"
        >
          <div className="flex items-center gap-1.5">
            <CheckCircleIcon size={16} className="shrink-0 text-leaf-700" />
            <p className="text-[13px] font-extrabold text-leaf-700">
              확인 항목을 만들었어요
            </p>
          </div>
          <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink">
            현재 확인된 금액은{" "}
            <b className="text-[16px] font-extrabold text-coral-700">
              {formatWon(knownTotal)}
            </b>
            부터예요.
            {unknownParts.length > 0 &&
              ` ${unknownParts.join("·")}은(는) 금액 확인 전이라 빠져 있어요.`}{" "}
            위 &lsquo;추가비용이 생길 수 있는 경우&rsquo;에 해당하면 그만큼
            더해질 수 있어요.
          </p>
          <p className="mt-3 text-[13px] font-extrabold text-sub">
            판매처에 이렇게 확인하세요
          </p>
          <ul className="mt-1.5 space-y-2">
            {adviceItems().map((item) => (
              <li
                key={item}
                className="flex gap-2 text-[13px] leading-snug text-sub"
              >
                <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-coral-400" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-[13px] leading-relaxed text-faint">
        연락처나 상세 주소는 받지 않아요. 입력한 조건은 확인 목록을 만드는
        데만 써요.
      </p>
    </section>
  );
}
