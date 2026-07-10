import Link from "next/link";

export function ProductsSetupRequired() {
  return (
    <section className="rounded-3xl border border-honey-700/20 bg-honey-50 p-6 shadow-soft">
      <p className="text-sm font-extrabold text-honey-700">Supabase 설정 필요</p>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight">
        상품 관리 DB를 먼저 연결해 주세요
      </h1>
      <p className="mt-3 text-sm leading-6 text-sub">
        관리자 화면에서는 시드 폴백을 수정하지 않습니다. 아래 환경변수를 설정하고
        SQL Editor에서 스키마와 시드를 적용하면 등록·수정 기능이 활성화됩니다.
      </p>
      <ul className="mt-4 space-y-1 rounded-2xl bg-white/80 px-4 py-3 font-mono text-xs text-ink">
        <li>SUPABASE_URL</li>
        <li>SUPABASE_SERVICE_ROLE_KEY</li>
        <li>supabase/schema.sql → supabase/seed.sql</li>
      </ul>
      <Link
        href="/admin"
        className="mt-5 inline-flex min-h-11 items-center rounded-full border border-[#E7DBC9] bg-white px-5 text-sm font-bold"
      >
        관리자 홈으로
      </Link>
    </section>
  );
}

export function ProductsLoadError({ message }: { message: string }) {
  return (
    <section className="rounded-3xl border border-red-200 bg-red-50 p-6 shadow-soft">
      <p className="text-sm font-extrabold text-red-700">상품 정보를 불러오지 못했습니다</p>
      <p className="mt-2 text-sm leading-6 text-red-800">{message}</p>
      <Link
        href="/admin/products"
        className="mt-5 inline-flex min-h-11 items-center rounded-full bg-white px-5 text-sm font-bold text-red-800"
      >
        다시 시도
      </Link>
    </section>
  );
}
