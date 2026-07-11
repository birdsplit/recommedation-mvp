import Link from "next/link";
import {
  PRODUCT_STATUS_LABELS,
  STALE_VERIFIED_DAYS,
  type ProductStatus,
} from "@/lib/constants";
import {
  getAdminProducts,
  isProductVerificationStale,
  verificationAgeInDays,
} from "@/lib/admin-products";
import { requireAdmin } from "@/lib/admin-auth";
import { ProductStatusSelect } from "./ProductStatusSelect";
import { ProductsLoadError, ProductsSetupRequired } from "./SetupRequired";

export const metadata = { title: "상품 관리" };

const STATUS_CLASSES: Record<ProductStatus, string> = {
  public: "bg-leaf-50 text-leaf-700",
  hidden: "bg-slate-100 text-slate-700",
  sold_out: "bg-red-50 text-red-700",
  needs_check: "bg-honey-50 text-honey-700",
};

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ statusResult?: string | string[] }>;
}) {
  await requireAdmin();
  const [result, query] = await Promise.all([getAdminProducts(), searchParams]);

  if (result.state === "setup-required") {
    return (
      <main className="px-5 pb-14 pt-7">
        <ProductsSetupRequired />
      </main>
    );
  }
  if (result.state === "error") {
    return (
      <main className="px-5 pb-14 pt-7">
        <ProductsLoadError message={result.message} />
      </main>
    );
  }

  const counts = result.products.reduce<Record<ProductStatus, number>>(
    (accumulator, product) => {
      accumulator[product.status] += 1;
      return accumulator;
    },
    { public: 0, hidden: 0, sold_out: 0, needs_check: 0 }
  );
  const statusResult = Array.isArray(query.statusResult)
    ? query.statusResult[0]
    : query.statusResult;

  return (
    <main className="space-y-5 px-5 pb-14 pt-7">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold text-coral-600">PRODUCTS</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">상품 관리</h1>
          <p className="mt-1 text-sm text-sub">전체 {result.products.length}개</p>
        </div>
        <Link
          href="/admin/products/new"
          className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-coral-600 px-5 text-sm font-extrabold text-white shadow-cta"
        >
          새 상품
        </Link>
      </header>

      {statusResult === "changed" && (
        <p
          className="rounded-2xl bg-leaf-50 px-4 py-3 text-sm font-bold text-leaf-700"
          role="status"
        >
          상품 상태를 변경했습니다.
        </p>
      )}
      {statusResult && statusResult !== "changed" && (
        <p
          className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-800"
          role="alert"
        >
          {statusResult === "setup-required"
            ? "Supabase 설정을 확인해 주세요."
            : statusResult === "invalid"
              ? "올바르지 않은 상품 상태 요청입니다."
              : statusResult === "source-required"
                ? "공개하려면 상품 수정 화면에서 정보 출처를 먼저 입력해 주세요."
              : "상품 상태를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요."}
        </p>
      )}

      <section className="grid grid-cols-2 gap-2" aria-label="상태별 상품 수">
        {(Object.entries(PRODUCT_STATUS_LABELS) as [ProductStatus, string][]).map(
          ([status, label]) => (
            <div key={status} className="rounded-2xl bg-white px-4 py-3 shadow-soft">
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-extrabold ${STATUS_CLASSES[status]}`}
              >
                {label}
              </span>
              <strong className="ml-2 text-lg">{counts[status]}</strong>
            </div>
          )
        )}
      </section>

      {result.products.length === 0 ? (
        <section className="rounded-3xl bg-white p-7 text-center shadow-card">
          <p className="font-bold">등록된 상품이 없습니다.</p>
          <p className="mt-2 text-sm text-sub">첫 상품은 비공개 상태로 등록해 검수해 보세요.</p>
        </section>
      ) : (
        <section className="space-y-3" aria-label="전체 상품">
          {result.products.map((product) => {
            const stale = isProductVerificationStale(product.last_verified_at);
            const age = verificationAgeInDays(product.last_verified_at);
            return (
              <article key={product.id} className="rounded-3xl bg-white p-5 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-extrabold ${STATUS_CLASSES[product.status]}`}
                    >
                      {PRODUCT_STATUS_LABELS[product.status]}
                    </span>
                    <h2 className="mt-2 truncate text-base font-extrabold">{product.name}</h2>
                    <p className="mt-1 truncate text-xs text-sub">{product.seller_name}</p>
                  </div>
                  <Link
                    href={`/admin/products/${product.id}`}
                    className="inline-flex min-h-10 shrink-0 items-center rounded-full border border-[#E7DBC9] px-4 text-xs font-extrabold"
                  >
                    수정
                  </Link>
                </div>

                <div
                  className={`mt-4 rounded-2xl px-3.5 py-3 text-xs ${
                    stale ? "bg-red-50 text-red-800" : "bg-cream text-sub"
                  }`}
                >
                  <p className="font-bold">
                    마지막 확인일 {product.last_verified_at}
                    {age !== null && age >= 0 ? ` · ${age}일 전` : ""}
                  </p>
                  {stale && (
                    <p className="mt-1 font-semibold">
                      {STALE_VERIFIED_DAYS}일을 넘겨 정보 재확인이 필요합니다.
                    </p>
                  )}
                </div>

                <div className="mt-4">
                  <ProductStatusSelect productId={product.id} status={product.status} />
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
