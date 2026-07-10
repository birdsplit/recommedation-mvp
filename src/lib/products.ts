import "server-only";
import type { Product } from "@/lib/reco/types";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase";
import { SEED_PRODUCTS } from "@/lib/seed-data";

/**
 * 상품 데이터 접근 (서버 전용).
 * Supabase 미설정 상태에서는 시드 데이터로 폴백해 화면 개발을 막지 않는다.
 */

export async function getPublicProducts(): Promise<Product[]> {
  if (!isSupabaseConfigured()) {
    return SEED_PRODUCTS.filter((p) => p.status === "public");
  }
  const { data, error } = await supabaseAdmin()
    .from("products")
    .select("*")
    .eq("status", "public")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`상품 조회 실패: ${error.message}`);
  return (data ?? []) as Product[];
}

export async function getProductById(id: string): Promise<Product | null> {
  if (!isSupabaseConfigured()) {
    return SEED_PRODUCTS.find((p) => p.id === id) ?? null;
  }
  const { data, error } = await supabaseAdmin()
    .from("products")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`상품 조회 실패: ${error.message}`);
  return (data as Product) ?? null;
}

export async function getPublicProductsByIds(ids: string[]): Promise<Product[]> {
  if (ids.length === 0) return [];
  if (!isSupabaseConfigured()) {
    return SEED_PRODUCTS.filter(
      (p) => p.status === "public" && ids.includes(p.id)
    );
  }
  const { data, error } = await supabaseAdmin()
    .from("products")
    .select("*")
    .eq("status", "public")
    .in("id", ids);
  if (error) throw new Error(`상품 조회 실패: ${error.message}`);
  return (data ?? []) as Product[];
}
