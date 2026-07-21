import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/data-mode";
import {
  getOperationalProductState,
  getProductById,
} from "@/lib/products";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase";
import { isUuid } from "@/lib/uuid";

/**
 * 화면10 — 판매처 이동 라우트.
 * outbound_click을 서버에서 기록한 뒤 판매처로 302 리다이렉트한다.
 * 기록 실패가 사용자의 이동을 막아서는 안 된다 (기획서 §11.1, §13).
 */

const VIA_VALUES = new Set([
  "cost_check",
  "detail",
  "results",
  "compare",
  "source",
]);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const searchParams = new URL(req.url).searchParams;
  const rankRaw = searchParams.get("rank");
  const viaRaw = searchParams.get("via");
  const runRaw = searchParams.get("run");
  const rank = rankRaw && /^[1-3]$/.test(rankRaw) ? Number(rankRaw) : null;
  const via = viaRaw && VIA_VALUES.has(viaRaw) ? viaRaw : null;
  const runId = isUuid(runRaw) ? runRaw : null;

  // 예시 상품을 실제 판매 상품으로 오인하지 않도록 URL 직접 접근도 차단한다.
  if (isDemoMode()) {
    return Response.json(
      { error: "demo_mode", message: "데모에서는 판매처 이동을 제공하지 않습니다." },
      { status: 403 }
    );
  }

  const cookieStore = await cookies();
  const sidRaw = cookieStore.get("sid")?.value ?? null;
  const sid = isUuid(sidRaw) ? sidRaw : crypto.randomUUID();
  const journeyRaw = cookieStore.get("jid")?.value ?? null;
  const journeyId = isUuid(journeyRaw) ? journeyRaw : crypto.randomUUID();
  const isTest = cookieStore.get("modoo_test")?.value === "1";
  const cohort = isTest
    ? cookieStore.get("modoo_cohort")?.value ?? null
    : null;

  const product = await getProductById(id);
  if (!product || product.status !== "public") {
    return NextResponse.redirect(new URL("/", req.url), 302);
  }
  const operational = await getOperationalProductState(id);
  if (
    !operational ||
    operational.status !== "public" ||
    operational.availability !== "in_stock"
  ) {
    return Response.json(
      {
        error: "product_unavailable",
        message: "현재 품절 또는 재확인 상태라 판매처 이동을 중단했습니다.",
      },
      { status: 409 }
    );
  }

  if (isSupabaseConfigured()) {
    try {
      const { error } = await supabaseAdmin()
        .from("events")
        .insert({
          session_id: sid,
          journey_id: journeyId,
          run_id: runId,
          event_version: 2,
          cohort,
          is_test: isTest,
          event_type: via === "source" ? "source_open" : "outbound_click",
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
    const destination =
      via === "source"
        ? operational.source_url ?? operational.seller_url
        : operational.seller_url;
    sellerUrl = new URL(destination);
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
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }
  if (!isUuid(journeyRaw)) {
    response.cookies.set("jid", journeyId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }
  return response;
}
