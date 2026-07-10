import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getProductById } from "@/lib/products";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase";

/**
 * 화면10 — 판매처 이동 라우트.
 * outbound_click을 서버에서 기록한 뒤 판매처로 302 리다이렉트한다.
 * 기록 실패가 사용자의 이동을 막아서는 안 된다 (기획서 §11.1, §13).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const searchParams = new URL(req.url).searchParams;
  const rankRaw = searchParams.get("rank");
  const via = searchParams.get("via");

  const cookieStore = await cookies();
  const sidRaw = cookieStore.get("sid")?.value ?? null;
  const sid = sidRaw && UUID_RE.test(sidRaw) ? sidRaw : null;

  const product = await getProductById(id);
  if (!product || product.status !== "public") redirect("/");

  if (isSupabaseConfigured()) {
    const rank = rankRaw !== null ? Number(rankRaw) : null;
    const { error } = await supabaseAdmin()
      .from("events")
      .insert({
        session_id: sid ?? crypto.randomUUID(),
        event_type: "outbound_click",
        payload: {
          productId: id,
          ...(rank !== null && Number.isFinite(rank) ? { rank } : {}),
          ...(via ? { via } : {}),
          viaCostCheck: via === "cost_check",
        },
      });
    if (error) {
      // 기록 실패는 로그만 남기고 이동은 계속한다
      console.error("outbound_click insert 실패:", error.message);
    }
  }

  return NextResponse.redirect(product.seller_url, 302);
}
