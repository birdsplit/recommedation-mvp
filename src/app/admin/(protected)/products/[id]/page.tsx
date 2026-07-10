import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/ProductForm";
import {
  getAdminProduct,
  todayInSeoul,
  type ProductFormValues,
} from "@/lib/admin-products";
import { requireAdmin } from "@/lib/admin-auth";
import { updateProductAction } from "../actions";
import { ProductsLoadError, ProductsSetupRequired } from "../SetupRequired";

export const metadata = { title: "상품 수정" };

export default async function EditAdminProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string | string[] }>;
}) {
  await requireAdmin();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const result = await getAdminProduct(id);

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
  if (!result.product) notFound();

  const product = result.product;
  const {
    id: productId,
    created_at: createdAt,
    updated_at: updatedAt,
    ...values
  } = product;
  const saved = Array.isArray(query.saved) ? query.saved[0] : query.saved;
  const action = updateProductAction.bind(null, productId);

  return (
    <main className="px-5 pb-14 pt-7">
      <header className="mb-5">
        <Link href="/admin/products" className="text-xs font-bold text-sub">
          ← 상품 목록
        </Link>
        <p className="mt-5 text-xs font-extrabold text-coral-600">EDIT PRODUCT</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">상품 수정</h1>
        <p className="mt-2 truncate text-sm font-semibold text-sub">{product.name}</p>
      </header>

      {(saved === "created" || saved === "updated") && (
        <div
          className="mb-4 rounded-2xl bg-leaf-50 px-4 py-3 text-sm font-bold text-leaf-700"
          role="status"
        >
          {saved === "created" ? "상품을 등록했습니다." : "변경사항을 저장했습니다."}
        </div>
      )}

      <ProductForm
        action={action}
        values={values as ProductFormValues}
        mode="edit"
        today={todayInSeoul()}
        metadata={{ id: productId, createdAt, updatedAt }}
      />
    </main>
  );
}
