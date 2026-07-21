import { readJsonObject } from "@/lib/http";
import { getDataMode } from "@/lib/data-mode";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase";
import { isUuid } from "@/lib/uuid";

/**
 * 화면11 — 결과 피드백 저장 (supabase feedback 테이블).
 * 추천 실행(run_id)을 기준으로 저장해 같은 브라우저의 여러 추천을 구분한다.
 * DB 설정 누락은 성공으로 위장하지 않고 503으로 알린다.
 */

const MAX_WORST_QUESTION_LEN = 500;
const MAX_BODY_BYTES = 8192;

function isScale1to5(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5;
}

export async function POST(req: Request): Promise<Response> {
  const parsed = await readJsonObject(req, MAX_BODY_BYTES);
  if (!parsed.ok) return new Response(null, { status: parsed.status });
  const body = parsed.value;

  const {
    session_id,
    journey_id,
    run_id,
    q_time_saved,
    q_conditions_reflected,
    q_reasons_helpful,
    q_decision_confidence,
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
  if (!isUuid(journey_id)) {
    return new Response(null, { status: 400 });
  }
  if (run_id !== undefined && run_id !== null && !isUuid(run_id)) {
    return new Response(null, { status: 400 });
  }
  if (
    !isScale1to5(q_time_saved) ||
    !isScale1to5(q_conditions_reflected) ||
    !isScale1to5(q_reasons_helpful) ||
    !isScale1to5(q_decision_confidence)
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

  if (!isSupabaseConfigured()) {
    return Response.json({ error: "feedback_unavailable" }, { status: 503 });
  }
  if (getDataMode() === "live" && !isUuid(run_id)) {
    return Response.json({ error: "run_id_required" }, { status: 400 });
  }

  const row = {
    session_id,
    journey_id,
    run_id: typeof run_id === "string" ? run_id : null,
    q_time_saved,
    q_conditions_reflected,
    q_reasons_helpful,
    q_decision_confidence,
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
  const write = (value: typeof row) =>
    value.run_id === null
      ? db.from("feedback").insert(value)
      : db.from("feedback").upsert(value, { onConflict: "run_id" });
  let { error } = await write(row);

  // 존재하지 않는 상품 id로 FK 오류가 나면 chosen_product_id 없이 1회 재시도
  // (피드백 본문을 잃는 것보다 상품 연결을 포기하는 편이 낫다)
  if (
    error &&
    row.chosen_product_id !== null &&
    error.message.toLowerCase().includes("foreign key")
  ) {
    ({ error } = await write({ ...row, chosen_product_id: null }));
  }

  if (error) {
    console.error("feedback insert 실패:", error.message);
    return new Response(null, { status: 500 });
  }
  return Response.json({ ok: true });
}
