import Link from "next/link";
import { redirect } from "next/navigation";
import {
  answersQuery,
  ASSEMBLY_ANSWER_LABELS,
  budgetLabel,
  CARRY_ANSWER_LABELS,
  conflictWarnings,
  DELIVERY_ANSWER_LABELS,
  hasAnswers,
  parseAnswers,
  STORAGE_ANSWER_LABELS,
} from "@/lib/reco/answers";
import { BackIcon, EditIcon, WarnIcon } from "@/components/icons";
import { EventOnMount } from "@/components/Track";
import { CreateRecommendationButton } from "@/components/CreateRecommendationButton";

/** 화면5 — 조건 요약 */
export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  if (!hasAnswers(sp)) redirect("/q/1");

  const answers = parseAnswers(sp);
  const query = answersQuery(answers);
  const warnings = conflictWarnings(answers);

  const rows = [
    {
      label: "침대 밑 공간",
      value: STORAGE_ANSWER_LABELS[answers.storage],
      editHref: `/q/1?${query}`,
    },
    {
      label: "집 안 운반",
      value: CARRY_ANSWER_LABELS[answers.carry],
      editHref: `/q/2?${query}`,
    },
    {
      label: "조립",
      value: ASSEMBLY_ANSWER_LABELS[answers.assembly],
      editHref: `/q/2?${query}`,
    },
    {
      label: "예산",
      value: budgetLabel(answers),
      editHref: `/q/3?${query}`,
    },
    {
      label: "배송 시기",
      value: DELIVERY_ANSWER_LABELS[answers.delivery],
      editHref: `/q/3?${query}`,
    },
    ...(answers.wantsMattress !== null
      ? [
          {
            label: "매트리스",
            value: answers.wantsMattress ? "포함 희망" : "프레임만",
            editHref: `/q/3?${query}`,
          },
        ]
      : []),
  ];

  return (
    <main className="flex min-h-dvh flex-col px-5 pb-10">
      <EventOnMount type="summary_view" payload={{ query }} />

      <div className="flex items-center gap-3 pt-6">
        <Link
          href={`/q/3?${query}`}
          aria-label="뒤로 가기"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-soft"
        >
          <BackIcon size={18} />
        </Link>
        <h1 className="text-[18px] font-extrabold">내 조건 확인</h1>
      </div>

      <p className="pt-7 text-[22px] font-extrabold leading-[1.4]">
        이렇게 이해했어요.
        <br />
        맞나요? 🙂
      </p>

      <div className="mt-5 space-y-2.5">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between rounded-3xl bg-white px-5 py-4 shadow-soft"
          >
            <div>
              <p className="text-[13px] font-bold text-faint">{row.label}</p>
              <p className="mt-0.5 text-[15px] font-bold">{row.value}</p>
            </div>
            <Link
              href={row.editHref}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#D9BDAE] px-3 py-1.5 text-[13px] font-bold text-coral-700"
            >
              <EditIcon size={11} />
              수정
            </Link>
          </div>
        ))}
      </div>

      {warnings.map((w) => (
        <div
          key={w}
          className="mt-3 flex gap-2 rounded-2xl bg-honey-50 px-4 py-3"
        >
          <WarnIcon size={16} className="mt-px shrink-0 text-honey-700" />
          <p className="text-[13px] font-medium leading-snug text-honey-700">{w}</p>
        </div>
      ))}

      <div className="mt-auto pt-8">
        <CreateRecommendationButton answers={answers} />
      </div>
    </main>
  );
}
