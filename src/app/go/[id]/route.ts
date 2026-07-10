import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getProductById } from "@/lib/products";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase";
import { isUuid } from "@/lib/uuid";

/**
 * 화면10 — 판매처 이동 라우트.
 * outbound_click을 서버에서 기록한 뒤 판매처로 302 리다이렉트한다.
 * 기록 실패가 사용자의 이동을 막아서는 안 된다 (기획서 §11.1, §13).
 */

const VIA_VALUES = new Set(["cost_check", "detail", "results", "compare"]);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const searchParams = new URL(req.url).searchParams;
  const rankRaw = searchParams.get("rank");
  const viaRaw = searchParams.get("via");
  const rank = rankRaw && /^[1-3]$/.test(rankRaw) ? Number(rankRaw) : null;
  const via = viaRaw && VIA_VALUES.has(viaRaw) ? viaRaw : null;

  const cookieStore = await cookies();
  const sidRaw = cookieStore.get("sid")?.value ?? null;
  const sid = isUuid(sidRaw) ? sidRaw : crypto.randomUUID();

  const product = await getProductById(id);
  if (!product || product.status !== "public") {
    return NextResponse.redirect(new URL("/", req.url), 302);
  }

  if (isSupabaseConfigured()) {
    try {
      const { error } = await supabaseAdmin()
        .from("events")
        .insert({
          session_id: sid,
          event_type: "outbound_click",
          payload: {
            productId: id,
            ...(rank !== null ? { rank } : {}),
            ...(via ? { via } : {}),
            viaCostCheck: via === "cost_check",
          },
        });
      if (error) {
        console.error("outbound_click insert 실패:", error.message);
      }
    } catch (error) {
      // 네트워크·SDK 예외도 판매처 이동을 막지 않는다.
      console.error("outbound_click 기록 중 예외:", error);
    }
  }

  let sellerUrl: URL;
  try {
    sellerUrl = new URL(product.seller_url);
    if (sellerUrl.protocol !== "https:" && sellerUrl.protocol !== "http:") {
      throw new Error("지원하지 않는 판매처 URL 프로토콜");
    }
  } catch (error) {
    console.error("유효하지 않은 판매처 URL:", error);
    sellerUrl = new URL("/", req.url);
  }

  const response = NextResponse.redirect(sellerUrl, 302);
  if (!isUuid(sidRaw)) {
    response.cookies.set("sid", sid, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }
  return response;
}
