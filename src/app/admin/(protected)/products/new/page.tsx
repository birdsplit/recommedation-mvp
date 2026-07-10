import Link from "next/link";
import { ProductForm } from "@/components/admin/ProductForm";
import {
  createEmptyProductFormValues,
  todayInSeoul,
} from "@/lib/admin-products";
import { requireAdmin } from "@/lib/admin-auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { createProductAction } from "../actions";
import { ProductsSetupRequired } from "../SetupRequired";

export const metadata = { title: "새 상품 등록" };

export default async function NewAdminProductPage() {
  await requireAdmin();

  if (!isSupabaseConfigured()) {
    return (
      <main className="px-5 pb-14 pt-7">
        <ProductsSetupRequired />
      </main>
    );
  }

  const today = todayInSeoul();

  return (
    <main className="px-5 pb-14 pt-7">
      <header className="mb-5">
        <Link href="/admin/products" className="text-xs font-bold text-sub">
          ← 상품 목록
        </Link>
        <p className="mt-5 text-xs font-extrabold text-coral-600">NEW PRODUCT</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">새 상품 등록</h1>
        <p className="mt-2 text-sm leading-6 text-sub">
          처음에는 비공개로 저장한 뒤 근거와 비용을 다시 검수하는 방식을 권장합니다.
        </p>
      </header>
      <ProductForm
        action={createProductAction}
        values={createEmptyProductFormValues(today)}
        mode="create"
        today={today}
      />
    </main>
  );
}
