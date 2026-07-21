import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export const metadata: Metadata = {
  title: "관리자 로그인",
};

type LoginPageProps = {
  searchParams: Promise<{
    error?: string | string[];
  }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "비밀번호가 올바르지 않습니다.",
  config: "관리자 로그인 환경변수가 설정되지 않았습니다.",
};

export default async function AdminLoginPage({
  searchParams,
}: LoginPageProps) {
  if (await isAdminAuthenticated()) {
    redirect("/admin");
  }

  const params = await searchParams;
  const errorCode = Array.isArray(params.error)
    ? params.error[0]
    : params.error;
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

  return (
    <main className="flex min-h-dvh items-center px-5 py-12">
      <section className="w-full rounded-[28px] bg-white p-6 shadow-card">
        <p className="text-[13px] font-extrabold tracking-[0.12em] text-coral-600">
          ADMIN
        </p>
        <h1 className="mt-2 text-[24px] font-extrabold">관리자 로그인</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-sub">
          상품 정보와 검증 데이터를 관리하려면 비밀번호를 입력하세요.
        </p>

        {errorMessage && (
          <p
            role="alert"
            className="mt-5 rounded-2xl bg-[#FCE8E4] px-4 py-3 text-[13px] font-bold text-coral-700"
          >
            {errorMessage}
          </p>
        )}

        <form action="/api/admin/login" method="post" className="mt-5">
          <input
            type="text"
            name="username"
            value="admin"
            autoComplete="username"
            readOnly
            hidden
          />
          <label
            htmlFor="admin-password"
            className="block text-[13px] font-extrabold text-ink"
          >
            관리자 비밀번호
          </label>
          <input
            id="admin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={1024}
            required
            autoFocus
            className="mt-2 w-full rounded-2xl border-2 border-[#F0DACD] bg-cream px-4 py-3.5 text-[15px] font-semibold outline-none transition focus:border-coral-400"
          />
          <button
            type="submit"
            className="mt-5 w-full rounded-full bg-gradient-to-r from-[#C8431B] to-[#A82E0C] py-4 text-[16px] font-extrabold text-white shadow-cta"
          >
            로그인
          </button>
        </form>
      </section>
    </main>
  );
}
