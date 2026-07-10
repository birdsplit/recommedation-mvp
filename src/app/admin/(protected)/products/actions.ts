"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import {
  insertAdminProduct,
  parseProductFormData,
  parseProductStatus,
  updateAdminProduct,
  updateAdminProductStatus,
  type ProductFieldErrors,
} from "@/lib/admin-products";
import { isSupabaseConfigured } from "@/lib/supabase";
import { isUuid } from "@/lib/uuid";

export interface ProductActionState {
  status: "idle" | "error";
  message: string;
  fieldErrors: ProductFieldErrors;
}

function setupRequiredState(): ProductActionState {
  return {
    status: "error",
    message:
      "Supabase가 설정되지 않아 상품을 저장할 수 없습니다. 환경변수와 DB 스키마를 먼저 설정해 주세요.",
    fieldErrors: {},
  };
}

function failureState(error: unknown): ProductActionState {
  return {
    status: "error",
    message:
      error instanceof Error ? error.message : "상품 저장 중 오류가 발생했습니다.",
    fieldErrors: {},
  };
}

function revalidateProductPaths(id?: string): void {
  revalidatePath("/admin/products");
  revalidatePath("/");
  revalidatePath("/results");
  revalidatePath("/compare");
  revalidatePath("/api/products");
  if (id) {
    revalidatePath(`/admin/products/${id}`);
    revalidatePath(`/products/${id}`);
  }
}

export async function createProductAction(
  _previousState: ProductActionState,
  formData: FormData
): Promise<ProductActionState> {
  await requireAdmin();

  const parsed = parseProductFormData(formData);
  if (!parsed.success) {
    return {
      status: "error",
      message: "입력 내용을 확인해 주세요.",
      fieldErrors: parsed.errors,
    };
  }
  if (!isSupabaseConfigured()) return setupRequiredState();

  let productId: string;
  try {
    ({ id: productId } = await insertAdminProduct(parsed.data));
  } catch (error) {
    return failureState(error);
  }

  revalidateProductPaths(productId);
  redirect(`/admin/products/${productId}?saved=created`);
}

export async function updateProductAction(
  id: string,
  _previousState: ProductActionState,
  formData: FormData
): Promise<ProductActionState> {
  await requireAdmin();

  if (!isUuid(id)) {
    return {
      status: "error",
      message: "올바르지 않은 상품 ID입니다.",
      fieldErrors: {},
    };
  }
  const parsed = parseProductFormData(formData);
  if (!parsed.success) {
    return {
      status: "error",
      message: "입력 내용을 확인해 주세요.",
      fieldErrors: parsed.errors,
    };
  }
  if (!isSupabaseConfigured()) return setupRequiredState();

  try {
    await updateAdminProduct(id, parsed.data);
  } catch (error) {
    return failureState(error);
  }

  revalidateProductPaths(id);
  redirect(`/admin/products/${id}?saved=updated`);
}

export async function changeProductStatusAction(
  id: string,
  formData: FormData
): Promise<void> {
  await requireAdmin();

  if (!isUuid(id)) {
    redirect("/admin/products?statusResult=invalid");
  }
  const status = parseProductStatus(formData.get("status"));
  if (!status) {
    redirect("/admin/products?statusResult=invalid");
  }
  if (!isSupabaseConfigured()) {
    redirect("/admin/products?statusResult=setup-required");
  }

  let failed = false;
  try {
    await updateAdminProductStatus(id, status);
  } catch {
    failed = true;
  }
  if (failed) redirect("/admin/products?statusResult=error");

  revalidateProductPaths(id);
  redirect("/admin/products?statusResult=changed");
}
