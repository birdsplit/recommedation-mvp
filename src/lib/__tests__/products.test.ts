import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configured: vi.fn(() => false),
  from: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: mocks.configured,
  supabaseAdmin: () => ({ from: mocks.from }),
}));

import {
  CatalogUnavailableError,
  getProductById,
  getPublicProducts,
  getPublicProductsByIds,
} from "@/lib/products";
import { SEED_PRODUCTS } from "@/lib/seed-data";

function chain(result: { data: unknown; error: null | { message: string } }) {
  const value: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit", "in"]) {
    value[method] = vi.fn(() => value);
  }
  value.maybeSingle = vi.fn(async () => result);
  value.then = (
    resolve: (result: { data: unknown; error: null | { message: string } }) => unknown,
    reject: (error: unknown) => unknown
  ) => Promise.resolve(result).then(resolve, reject);
  return value;
}

const releaseId = "10000000-0000-4000-8000-000000000001";
const releasedProducts = SEED_PRODUCTS.slice(0, 2).map((product) => ({
  ...product,
  availability: "in_stock",
  internal_key: `test:${product.id}`,
  offer_id: product.id,
  variant_key: "default",
  option_name: "SS",
  source_url: product.seller_url,
}));

function useLiveCatalog(
  products = releasedProducts,
  currentStates = products.map((product) => ({
    id: product.id,
    status: "public",
    availability: "in_stock",
  }))
): void {
  mocks.configured.mockReturnValue(true);
  mocks.from.mockImplementation((table: string) => {
    if (table === "catalog_releases") {
      return chain({
        data: {
          id: releaseId,
          version: "2026-07-test",
          published_at: "2026-07-12T00:00:00.000Z",
        },
        error: null,
      });
    }
    if (table === "catalog_release_products") {
      return chain({
        data: products.map((product, index) => ({
          product_id: product.id,
          position: index + 1,
          product_snapshot: product,
        })),
        error: null,
      });
    }
    if (table === "products") {
      return chain({
        data: currentStates,
        error: null,
      });
    }
    throw new Error(`Unexpected table: ${table}`);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-12T03:00:00.000Z"));
  delete process.env.DATA_MODE;
  mocks.configured.mockReset();
  mocks.configured.mockReturnValue(false);
  mocks.from.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("catalog product access", () => {
  it("uses test fixtures in the safe default demo mode without querying Supabase", async () => {
    const products = await getPublicProducts();

    expect(products).toHaveLength(10);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("does not fall back to demo fixtures in unconfigured live mode", async () => {
    process.env.DATA_MODE = "live";

    await expect(getPublicProducts()).rejects.toThrow(
      "DATA_MODE=live requires"
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("requires a published catalog release in live mode", async () => {
    process.env.DATA_MODE = "live";
    mocks.configured.mockReturnValue(true);
    mocks.from.mockReturnValue(
      chain({ data: null, error: null }) as never
    );

    await expect(getPublicProducts()).rejects.toBeInstanceOf(
      CatalogUnavailableError
    );
  });

  it("serves immutable release snapshots instead of mutable product rows", async () => {
    process.env.DATA_MODE = "live";
    useLiveCatalog();

    const products = await getPublicProducts();

    expect(products.map(({ id }) => id)).toEqual(
      releasedProducts.map(({ id }) => id)
    );
    // mutable row의 내용은 읽지 않고 품절/공개 상태만 overlay로 확인한다.
    expect(mocks.from).toHaveBeenCalledWith("products");
  });

  it("keeps requested id order and returns null for an absent released product", async () => {
    process.env.DATA_MODE = "live";
    useLiveCatalog([...releasedProducts].reverse());

    const ordered = await getPublicProductsByIds(
      releasedProducts.map(({ id }) => id)
    );
    expect(ordered.map(({ id }) => id)).toEqual(
      releasedProducts.map(({ id }) => id)
    );

    useLiveCatalog([]);
    await expect(
      getProductById("20000000-0000-4000-8000-000000000001")
    ).resolves.toBeNull();
  });

  it("blocks stale release snapshots and immediately excludes a sold-out base product", async () => {
    process.env.DATA_MODE = "live";
    useLiveCatalog([
      {
        ...releasedProducts[0],
        commercial_verified_at: "2026-07-01",
        spec_verified_at: "2026-07-01",
      },
    ]);
    await expect(getPublicProducts()).rejects.toThrow("7일 이내");

    useLiveCatalog(releasedProducts, [
      {
        id: releasedProducts[0].id,
        status: "sold_out",
        availability: "out_of_stock",
      },
      {
        id: releasedProducts[1].id,
        status: "public",
        availability: "in_stock",
      },
    ]);
    await expect(getPublicProducts()).resolves.toEqual([releasedProducts[1]]);
  });
});
