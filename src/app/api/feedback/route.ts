import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase";
import { isUuid } from "@/lib/uuid";

/**
 * 화면11 — 결과 피드백 저장 (supabase feedback 테이블).
 * Supabase 미설정(초기 개발)에서는 204로 조용히 성공 처리해 화면 흐름을 막지 않는다
 * (/api/events/route.ts와 같은 폴백 패턴).
 */

const MAX_WORST_QUESTION_LEN = 500;

function isScale1to5(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5;
}

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return new Response(null, { status: 400 });
  }

  const {
    session_id,
    q_time_saved,
    q_conditions_reflected,
    q_reasons_helpful,
    q_found_candidate,
    q_would_reuse,
    q_worst_question,
    chosen_product_id,
    post_purchase_optin,
  } = body as Record<string, unknown>;

  // ---------- 필수 항목 ----------
  if (!isUuid(session_id)) {
    return new Response(null, { status: 400 });
  }
  if (
    !isScale1to5(q_time_saved) ||
    !isScale1to5(q_conditions_reflected) ||
    !isScale1to5(q_reasons_helpful)
  ) {
    return new Response(null, { status: 400 });
  }
  if (
    typeof q_found_candidate !== "boolean" ||
    typeof q_would_reuse !== "boolean"
  ) {
    return new Response(null, { status: 400 });
  }

  // ---------- 선택 항목 ----------
  if (
    q_worst_question !== undefined &&
    q_worst_question !== null &&
    (typeof q_worst_question !== "string" ||
      q_worst_question.length > MAX_WORST_QUESTION_LEN)
  ) {
    return new Response(null, { status: 400 });
  }
  if (
    chosen_product_id !== undefined &&
    chosen_product_id !== null &&
    !isUuid(chosen_product_id)
  ) {
    return new Response(null, { status: 400 });
  }
  if (
    post_purchase_optin !== undefined &&
    typeof post_purchase_optin !== "boolean"
  ) {
    return new Response(null, { status: 400 });
  }

  // Supabase 미설정 상태에서는 조용히 성공 처리 (개발 폴백)
  if (!isSupabaseConfigured()) {
    return new Response(null, { status: 204 });
  }

  const row = {
    session_id,
    q_time_saved,
    q_conditions_reflected,
    q_reasons_helpful,
    q_found_candidate,
    q_would_reuse,
    q_worst_question:
      typeof q_worst_question === "string" && q_worst_question.trim() !== ""
        ? q_worst_question.trim()
        : null,
    chosen_product_id:
      typeof chosen_product_id === "string" ? chosen_product_id : null,
    post_purchase_optin: post_purchase_optin === true,
  };

  const db = supabaseAdmin();
  let { error } = await db.from("feedback").insert(row);

  // 존재하지 않는 상품 id로 FK 오류가 나면 chosen_product_id 없이 1회 재시도
  // (피드백 본문을 잃는 것보다 상품 연결을 포기하는 편이 낫다)
  if (
    error &&
    row.chosen_product_id !== null &&
    error.message.toLowerCase().includes("foreign key")
  ) {
    ({ error } = await db
      .from("feedback")
      .insert({ ...row, chosen_product_id: null }));
  }

  if (error) {
    console.error("feedback insert 실패:", error.message);
    return new Response(null, { status: 500 });
  }
  return Response.json({ ok: true });
}
