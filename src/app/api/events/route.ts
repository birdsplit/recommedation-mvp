import { cookies } from "next/headers";
import { EVENT_TYPES, type EventType } from "@/lib/constants";
import { readJsonObject } from "@/lib/http";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase";
import { isUuid } from "@/lib/uuid";

const MAX_PAYLOAD_BYTES = 2048;
const MAX_BODY_BYTES = 4096;

export async function POST(req: Request): Promise<Response> {
  const parsed = await readJsonObject(req, MAX_BODY_BYTES);
  if (!parsed.ok) return new Response(null, { status: parsed.status });
  const body = parsed.value;

  const {
    session_id,
    journey_id,
    run_id,
    event_version,
    cohort,
    event_type,
    payload,
  } = body as {
    session_id?: unknown;
    journey_id?: unknown;
    run_id?: unknown;
    event_version?: unknown;
    cohort?: unknown;
    event_type?: unknown;
    payload?: unknown;
  };

  if (!isUuid(session_id)) {
    return new Response(null, { status: 400 });
  }
  if (!isUuid(journey_id)) {
    return new Response(null, { status: 400 });
  }
  if (run_id !== undefined && run_id !== null && !isUuid(run_id)) {
    return new Response(null, { status: 400 });
  }
  if (event_version !== 2) {
    return new Response(null, { status: 400 });
  }
  if (
    cohort !== undefined &&
    cohort !== null &&
    (typeof cohort !== "string" || cohort.length > 80)
  ) {
    return new Response(null, { status: 400 });
  }
  if (
    typeof event_type !== "string" ||
    !EVENT_TYPES.includes(event_type as EventType)
  ) {
    return new Response(null, { status: 400 });
  }
  const safePayload =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload
      : {};
  if (
    new TextEncoder().encode(JSON.stringify(safePayload)).byteLength >
    MAX_PAYLOAD_BYTES
  ) {
    return new Response(null, { status: 400 });
  }

  // 설정 누락을 성공처럼 응답하면 검증 데이터가 조용히 유실된다.
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "analytics_unavailable" }, { status: 503 });
  }

  const cookieStore = await cookies();
  // is_test는 클라이언트 본문을 신뢰하지 않고 서버가 발급한 HttpOnly 쿠키만 본다.
  const isTest = cookieStore.get("modoo_test")?.value === "1";
  const issuedCohort = isTest
    ? cookieStore.get("modoo_cohort")?.value ?? null
    : null;

  const { error } = await supabaseAdmin().from("events").insert({
    session_id,
    journey_id,
    run_id: typeof run_id === "string" ? run_id : null,
    event_version,
    cohort:
      issuedCohort ??
      (typeof cohort === "string" && cohort.trim() !== ""
        ? cohort.trim()
        : null),
    is_test: isTest,
    event_type,
    payload: safePayload,
  });
  if (error) {
    console.error("events insert 실패:", error.message);
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
