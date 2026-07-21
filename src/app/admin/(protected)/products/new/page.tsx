import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";

export const metadata = { title: "CSV 신규 상품 등록" };

export default async function NewAdminProductPage() {
  await requireAdmin();

  return (
    <main className="px-5 pb-14 pt-7">
      <Link href="/admin/products" className="text-[13px] font-bold text-sub">
        ← 상품 목록
      </Link>
      <section className="mt-5 rounded-[28px] bg-white p-6 shadow-card">
        <p className="text-[13px] font-extrabold text-coral-700">CSV FIRST</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
          신규 상품은 CSV로 등록해요
        </h1>
        <p className="mt-3 text-sm leading-6 text-sub">
          판매처 상품번호·옵션 키·출처 근거를 빠뜨리지 않도록 신규 등록은 조사
          시트와 검증 명령을 사용합니다. 이 화면의 개별 폼은 기존 상품의 수정,
          품절 처리, 확인일 갱신에만 사용합니다.
        </p>
        <ol className="mt-5 space-y-3 text-sm leading-6">
          <li><b>1.</b> 조사 워크북의 <b>실상품CSV</b> 시트를 검수합니다.</li>
          <li><b>2.</b> 해당 시트만 UTF-8 CSV로 내보냅니다.</li>
          <li><b>3.</b> 아래 명령으로 검증·미리보기·반영·공개합니다.</li>
        </ol>
        <pre className="mt-4 overflow-x-auto rounded-2xl bg-[#2F2924] p-4 text-[13px] leading-6 text-white"><code>{`npm run catalog:validate -- --file data/catalog-products.csv
npm run catalog:import -- --file data/catalog-products.csv --dry-run
npm run catalog:import -- --file data/catalog-products.csv
npm run catalog:release -- --version 2026-07-27.1`}</code></pre>
        <Link
          href="/admin/products"
          className="mt-6 flex w-full items-center justify-center rounded-full bg-gradient-to-r from-[#C8431B] to-[#A82E0C] py-4 text-[15px] font-extrabold text-white shadow-cta"
        >
          상품 목록으로 돌아가기
        </Link>
      </section>
    </main>
  );
}
