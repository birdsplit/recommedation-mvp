import { getPublicProductsByIds } from "@/lib/products";

/**
 * 공개 상품 조회 — 비교함(화면8)·피드백 화면 등 클라이언트가 id로 상품을 얻을 때 사용.
 * GET /api/products?ids=uuid1,uuid2 → { products: Product[] }
 * 클라이언트는 server-only인 lib/products를 직접 import할 수 없으므로 이 라우트를 거친다.
 * 공개(public) 상품만 돌려주므로 비공개로 바뀐 id는 응답에서 조용히 빠진다.
 */

/** products.id는 uuid 컬럼 — 형식이 아닌 값은 조회 전에 걸러 DB 오류를 막는다 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 10;

export async function GET(req: Request): Promise<Response> {
  const idsParam = new URL(req.url).searchParams.get("ids") ?? "";
  const ids = [
    ...new Set(
      idsParam
        .split(",")
        .map((v) => v.trim())
        .filter((v) => UUID_RE.test(v))
    ),
  ].slice(0, MAX_IDS);

  if (ids.length === 0) {
    return Response.json({ products: [] });
  }

  try {
    const products = await getPublicProductsByIds(ids);
    // 요청한 순서를 유지해 화면 순서(비교함 담은 순서·추천 순위)와 맞춘다
    const byId = new Map(products.map((p) => [p.id, p]));
    const ordered = ids
      .map((id) => byId.get(id))
      .filter((p) => p !== undefined);
    return Response.json({ products: ordered });
  } catch (e) {
    console.error("products 조회 실패:", e);
    return Response.json({ products: [] }, { status: 500 });
  }
}
