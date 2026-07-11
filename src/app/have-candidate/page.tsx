import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRightIcon, BackIcon, InfoIcon } from "@/components/icons";
import { TrackedLink } from "@/components/Track";

export const metadata: Metadata = {
  title: "이미 후보가 있으신가요?",
};

/** 경로 A — 이미 후보가 있음 (기획서 §4.1, MVP에서는 수동 테스트만 · 안내 화면) */
export default function HaveCandidatePage() {
  return (
    <main className="min-h-dvh pb-12">
      {/* 상단 바 */}
      <div className="flex items-center gap-3 px-5 pt-6">
        <Link
          href="/"
          aria-label="처음으로 돌아가기"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-soft"
        >
          <BackIcon size={18} />
        </Link>
        <h1 className="text-[18px] font-extrabold">이미 후보가 있으신가요?</h1>
      </div>

      {/* 안내 카드 */}
      <div className="mx-5 mt-5 rounded-[28px] bg-white p-6 shadow-card">
        <p className="text-[34px]">🛏️</p>
        <h2 className="mt-2 text-[19px] font-extrabold leading-snug">
          봐둔 침대끼리 비교하는 기능,
          <br />
          지금 준비하고 있어요
        </h2>
        <p className="mt-3 text-[14px] leading-relaxed text-sub">
          링크나 상품명을 넣으면 수납·청소·운반·조립·총비용까지 자동으로
          비교해드리는 기능을 만드는 중이에요. 조금만 기다려주세요 🙏
        </p>
        <p className="mt-3 text-[14px] leading-relaxed text-sub">
          그동안은 생활조건 질문 3개에 답하면 조건에 맞는 침대{" "}
          <b className="font-extrabold text-coral-700">후보 3개</b>를
          골라드리는 흐름을 써보실 수 있어요. 약 1분이면 끝나요.
        </p>

        <TrackedLink
          event="start_click"
          payload={{ entry: "questions", from: "have_candidate" }}
          href="/q/1"
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#F95B36] to-[#EE4E26] py-4 text-[17px] font-extrabold text-white shadow-cta"
        >
          질문으로 후보 찾기
          <ArrowRightIcon size={17} />
        </TrackedLink>
      </div>

      {/* 보조 안내 카드 */}
      <div className="mx-5 mt-4 flex gap-2.5 rounded-3xl bg-peach-50 px-4 py-4">
        <InfoIcon size={15} className="mt-0.5 shrink-0 text-coral-700" />
        <p className="text-[13px] leading-relaxed text-sub">
          봐둔 후보를 함께 비교해보는{" "}
          <b className="font-bold text-ink">수동 비교 테스트</b>에 참여하고
          싶으시다면, 추천을 받아본 뒤 피드백 화면에서 재방문 의사를
          남겨주세요. 연락처는 따로 받지 않아요.
        </p>
      </div>
    </main>
  );
}
