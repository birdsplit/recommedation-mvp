import { connection } from "next/server";
import { SERVICE_NAME } from "@/lib/constants";
import { HeroBedIllustration } from "@/components/BedIllustration";
import { ArrowRightIcon, CheckIcon, LogoMark, ShieldIcon } from "@/components/icons";
import { TrackedLink, VisitTracker } from "@/components/Track";
import { getDataMode } from "@/lib/data-mode";
import { getPublicProducts } from "@/lib/products";

/** 화면1 — 랜딩·시작 */
export default async function LandingPage() {
  // 관리자 상태 변경 뒤 상품 수가 빌드 시점 값으로 굳지 않도록 요청 때 조회한다.
  await connection();
  const dataMode = getDataMode();
  const isDemo = dataMode === "demo";
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
          수납 · 청소 · 운반 · 조립 · 추가비용 가능성까지
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
          payload={{ entry: "questions" }}
          href="/q/1"
          className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#C8431B] to-[#A82E0C] py-[18px] text-[19px] font-extrabold text-white shadow-cta"
        >
          침대 후보 찾기
          <ArrowRightIcon size={19} />
        </TrackedLink>
      </div>

      {/* 추천 범위·운영 방식 */}
      <footer className="mx-5 mt-8 pb-9">
        <section
          aria-labelledby="landing-trust-title"
          className="rounded-[24px] border border-[#E9DED2] bg-white/80 p-5"
        >
          <h2
            id="landing-trust-title"
            className="flex items-center gap-2 text-[15px] font-extrabold"
          >
            <ShieldIcon size={16} className="shrink-0 text-leaf-700" />
            추천 전에 알려드려요
          </h2>
          <dl className="mt-3 space-y-3 text-[13px] leading-relaxed text-sub">
            <div>
              <dt className="font-extrabold text-ink">추천 범위</dt>
              <dd>
                {isDemo ? "예시 " : "공개 "}슈퍼싱글 프레임 {productCount}개를
                생활조건에 맞춰 비교해요. 방 실측과 구매 전 최종 확인은 별도로
                필요해요.
              </dd>
            </div>
            <div>
              <dt className="font-extrabold text-ink">운영·제휴</dt>
              <dd>
                모두의침대 MVP 프로젝트가 운영해요. 현재 판매처 광고·제휴 관계가
                없으며 최저가나 구매 결과를 보장하지 않아요.
              </dd>
            </div>
            <div>
              <dt className="font-extrabold text-ink">개인정보·이용 기록</dt>
              <dd>
                로그인과 연락처 없이 이용할 수 있어요. 서비스 개선을 위해 익명
                이용 흐름과 피드백을 기록해요. 익명 브라우저 식별자는 30일,
                원시 실험 이벤트는 90일 보관을 기본으로 해요.
              </dd>
            </div>
          </dl>
        </section>
      </footer>
    </main>
  );
}
