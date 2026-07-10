import Link from "next/link";
import { SERVICE_NAME } from "@/lib/constants";
import { HeroBedIllustration } from "@/components/BedIllustration";
import { ArrowRightIcon, CheckIcon, LogoMark, ShieldIcon } from "@/components/icons";
import { TrackedLink, VisitTracker } from "@/components/Track";
import { getPublicProducts } from "@/lib/products";

/** 화면1 — 랜딩·시작 */
export default async function LandingPage() {
  const productCount = (await getPublicProducts()).length;

  return (
    <main className="flex min-h-dvh flex-col">
      <VisitTracker path="/" />

      {/* 로고 */}
      <div className="flex items-center justify-center gap-2 px-8 pt-10">
        <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-coral-500 shadow-cta">
          <LogoMark size={18} />
        </span>
        <span className="text-[18px] font-extrabold tracking-tight">
          {SERVICE_NAME}
        </span>
      </div>

      {/* 히어로 */}
      <div className="px-8 pt-8 text-center">
        <h1 className="text-[27px] font-extrabold leading-[1.4]">
          내 생활조건에 맞는 침대,
          <br />
          <span className="text-coral-600">3개만</span> 골라드려요
        </h1>
        <p className="mt-3.5 text-[15px] leading-relaxed text-sub">
          수납 · 청소 · 운반 · 조립 · 총비용까지
          <br />한 번에 비교해요
        </p>

        <div className="mt-5 flex items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-[#F0E4D6] bg-white px-3.5 py-1.5 text-[13px] font-semibold text-sub">
            ⏱ 약 1분 소요
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#F0E4D6] bg-white px-3.5 py-1.5 text-[13px] font-semibold text-sub">
            <CheckIcon size={12} className="text-leaf-700" />
            로그인 없이 바로
          </span>
        </div>
      </div>

      {/* 일러스트 */}
      <div className="px-8 pt-6">
        <HeroBedIllustration />
      </div>

      {/* CTA */}
      <div className="px-8 pt-6">
        <TrackedLink
          event="start_click"
          href="/q/1"
          className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#F95B36] to-[#EE4E26] py-[18px] text-[19px] font-extrabold text-white shadow-cta"
        >
          침대 후보 찾기
          <ArrowRightIcon size={19} />
        </TrackedLink>
        <Link
          href="/have-candidate"
          className="mt-4 flex items-center justify-center gap-1 text-[15px] font-bold text-coral-700"
        >
          이미 후보가 있어요
          <ArrowRightIcon size={15} />
        </Link>
      </div>

      {/* 신뢰 문구 */}
      <div className="mx-8 mt-auto border-t border-[#F0E7DB] pb-9 pt-5">
        <p className="flex items-center justify-center gap-1.5 text-center text-[12.5px] font-medium text-faint">
          <ShieldIcon size={14} className="shrink-0 text-leaf-700" />
          현재 슈퍼싱글 프레임 {productCount}개를 직접 검토해 추천하고 있어요
        </p>
      </div>
    </main>
  );
}
