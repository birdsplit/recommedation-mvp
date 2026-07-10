import { EVENT_TYPES, type EventType } from "@/lib/constants";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PAYLOAD_BYTES = 2048;

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return new Response(null, { status: 400 });
  }

  const { session_id, event_type, payload } = body as {
    session_id?: unknown;
    event_type?: unknown;
    payload?: unknown;
  };

  if (typeof session_id !== "string" || !UUID_RE.test(session_id)) {
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
  if (JSON.stringify(safePayload).length > MAX_PAYLOAD_BYTES) {
    return new Response(null, { status: 400 });
  }

  // Supabase 미설정 상태(초기 개발)에서는 조용히 버린다 — 화면 흐름을 막지 않기 위함
  if (!isSupabaseConfigured()) {
    return new Response(null, { status: 204 });
  }

  const { error } = await supabaseAdmin().from("events").insert({
    session_id,
    event_type,
    payload: safePayload,
  });
  if (error) {
    console.error("events insert 실패:", error.message);
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
