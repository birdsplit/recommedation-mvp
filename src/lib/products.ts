import "server-only";
import {
  assertLiveDataConfiguration,
  isDemoDataMode,
} from "@/lib/data-mode";
import type { Product } from "@/lib/reco/types";
import { SEED_PRODUCTS } from "@/lib/seed-data";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase";
import { isUuid } from "@/lib/uuid";

type ReleaseProductRow = {
  product_id: string;
  position: number;
  product_snapshot: unknown;
};

export interface PublishedCatalogRelease {
  id: string;
  version: string;
  publishedAt: string;
}

export interface PublicCatalog {
  products: Product[];
  release: PublishedCatalogRelease | null;
}

export interface OperationalProductState {
  id: string;
  status: Product["status"];
  availability: Product["availability"];
  seller_url: string;
  source_url?: string;
  commercial_verified_at?: string;
  spec_verified_at?: string;
}

export class CatalogUnavailableError extends Error {
  constructor(message = "발행된 실상품 카탈로그를 사용할 수 없습니다.") {
    super(message);
    this.name = "CatalogUnavailableError";
  }
}

function isProductSnapshot(value: unknown): value is Product {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    isUuid(row.id) &&
    typeof row.name === "string" &&
    row.name.trim() !== "" &&
    typeof row.seller_url === "string" &&
    row.status === "public" &&
    row.availability === "in_stock"
  );
}

async function getPublishedRelease(): Promise<PublishedCatalogRelease> {
  assertLiveDataConfiguration(isSupabaseConfigured());
  const { data, error } = await supabaseAdmin()
    .from("catalog_releases")
    .select("id,version,published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new CatalogUnavailableError(`카탈로그 릴리스 조회 실패: ${error.message}`);
  }
  if (
    !data ||
    !isUuid(data.id) ||
    typeof data.version !== "string" ||
    typeof data.published_at !== "string"
  ) {
    throw new CatalogUnavailableError("발행된 실상품 카탈로그가 없습니다.");
  }
  return {
    id: data.id,
    version: data.version,
    publishedAt: data.published_at,
  };
}

function todayInSeoul(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function ageInDays(value: string | undefined, today: string): number | null {
  if (!value) return null;
  const observed = new Date(`${value}T00:00:00.000Z`).valueOf();
  const reference = new Date(`${today}T00:00:00.000Z`).valueOf();
  if (!Number.isFinite(observed) || !Number.isFinite(reference)) return null;
  return Math.floor((reference - observed) / 86_400_000);
}

function freshnessError(product: Product): string | null {
  const today = todayInSeoul();
  const commercialAge = ageInDays(
    product.commercial_verified_at ?? product.last_verified_at,
    today
  );
  const specAge = ageInDays(
    product.spec_verified_at ?? product.last_verified_at,
    today
  );
  if (commercialAge === null || commercialAge < 0 || commercialAge > 7) {
    return `${product.name}: 가격·재고·배송 정보를 7일 이내 다시 확인해야 합니다.`;
  }
  if (specAge === null || specAge < 0 || specAge > 30) {
    return `${product.name}: 고정 사양을 30일 이내 다시 확인해야 합니다.`;
  }
  if (product.bed_size !== "SS") {
    return `${product.name}: 현재 MVP 공개 범위(SS)와 다른 규격입니다.`;
  }
  return null;
}

function snapshotsFromRows(
  rows: ReleaseProductRow[],
  allowEmpty: boolean
): Product[] {
  if (rows.length === 0 && !allowEmpty) {
    throw new CatalogUnavailableError("발행된 카탈로그에 상품이 없습니다.");
  }
  let firstUnavailableReason: string | null = null;
  const products = rows.flatMap(({ product_snapshot }) => {
    if (!isProductSnapshot(product_snapshot)) {
      throw new CatalogUnavailableError("카탈로그 상품 스냅샷이 유효하지 않습니다.");
    }
    const reason = freshnessError(product_snapshot);
    if (reason) {
      firstUnavailableReason ??= reason;
      return [];
    }
    return [product_snapshot];
  });
  if (products.length === 0 && !allowEmpty) {
    throw new CatalogUnavailableError(
      firstUnavailableReason ?? "발행된 카탈로그에 사용 가능한 상품이 없습니다."
    );
  }
  return products;
}

async function getLiveCatalog(ids?: string[]): Promise<PublicCatalog> {
  const release = await getPublishedRelease();
  let query = supabaseAdmin()
    .from("catalog_release_products")
    .select("product_id,position,product_snapshot")
    .eq("release_id", release.id)
    .order("position", { ascending: true });

  if (ids) query = query.in("product_id", ids);
  const { data, error } = await query;
  if (error) {
    throw new CatalogUnavailableError(`카탈로그 상품 조회 실패: ${error.message}`);
  }
  const releaseRows = (data ?? []) as ReleaseProductRow[];
  const productIds = releaseRows.map((row) => row.product_id);
  const { data: currentRows, error: currentError } = await supabaseAdmin()
    .from("products")
    .select("id,status,availability")
    .in("id", productIds);
  if (currentError) {
    throw new CatalogUnavailableError(`현재 상품 상태 조회 실패: ${currentError.message}`);
  }
  const eligibleIds = new Set(
    (currentRows ?? [])
      .filter(
        (row) => row.status === "public" && row.availability === "in_stock"
      )
      .map((row) => row.id as string)
  );
  const eligibleRows = releaseRows.filter((row) => eligibleIds.has(row.product_id));
  return {
    release,
    products: snapshotsFromRows(
      eligibleRows,
      ids !== undefined
    ),
  };
}

/** 상품과 정확히 그 상품을 담은 릴리스 참조를 한 번에 읽는다. */
export async function getPublicCatalog(): Promise<PublicCatalog> {
  if (isDemoDataMode()) {
    return {
      products: SEED_PRODUCTS.filter((product) => product.status === "public"),
      release: null,
    };
  }
  return getLiveCatalog();
}

/** Server-only catalog access. Demo fixtures are never a live-mode fallback. */
export async function getPublicProducts(): Promise<Product[]> {
  return (await getPublicCatalog()).products;
}

export async function getProductById(id: string): Promise<Product | null> {
  if (!isUuid(id)) return null;
  if (isDemoDataMode()) {
    return (
      SEED_PRODUCTS.find(
        (product) => product.id === id && product.status === "public"
      ) ?? null
    );
  }
  const { products } = await getLiveCatalog([id]);
  return products.find((product) => product.id === id) ?? null;
}

export async function getPublicProductsByIds(ids: string[]): Promise<Product[]> {
  const validIds = [...new Set(ids.filter(isUuid))];
  if (validIds.length === 0) return [];
  if (isDemoDataMode()) {
    return SEED_PRODUCTS.filter(
      (product) =>
        product.status === "public" && validIds.includes(product.id)
    );
  }
  const { products } = await getLiveCatalog(validIds);
  const byId = new Map(products.map((product) => [product.id, product]));
  return validIds
    .map((id) => byId.get(id))
    .filter((product): product is Product => product !== undefined);
}

/** 판매 직전에는 immutable release가 아니라 현재 운영 상태를 다시 확인한다. */
export async function getOperationalProductState(
  id: string
): Promise<OperationalProductState | null> {
  if (!isUuid(id)) return null;
  if (isDemoDataMode()) return null;
  assertLiveDataConfiguration(isSupabaseConfigured());
  const { data, error } = await supabaseAdmin()
    .from("products")
    .select(
      "id,status,availability,seller_url,source_url,commercial_verified_at,spec_verified_at"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new CatalogUnavailableError(`운영 상품 조회 실패: ${error.message}`);
  return (data as OperationalProductState | null) ?? null;
}
