import type { EventType } from "@/lib/constants";

/**
 * 익명 세션 이벤트 트래킹 (클라이언트 전용).
 * - 세션 id: localStorage의 UUID. /go/[id] 서버 핸들러가 outbound_click을
 *   귀속시킬 수 있도록 쿠키(sid)에도 미러링한다.
 * - 전송: sendBeacon 우선(페이지 이탈에도 유실 최소화), 실패 시 keepalive fetch.
 *   실패해도 사용자 흐름을 막지 않는다.
 */

const SID_KEY = "modoo_sid";
const VISIT_KEY = "modoo_last_visit";

export function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let sid = localStorage.getItem(SID_KEY);
  if (!sid) {
    sid = crypto.randomUUID();
    localStorage.setItem(SID_KEY, sid);
  }
  document.cookie = `sid=${sid}; path=/; max-age=31536000; samesite=lax`;
  return sid;
}

export function track(
  eventType: EventType,
  payload: Record<string, unknown> = {}
): void {
  if (typeof window === "undefined") return;
  try {
    const body = JSON.stringify({
      session_id: getSessionId(),
      event_type: eventType,
      payload,
    });
    const sent =
      typeof navigator.sendBeacon === "function" &&
      navigator.sendBeacon(
        "/api/events",
        new Blob([body], { type: "application/json" })
      );
    if (!sent) {
      fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // 트래킹 실패는 무시
  }
}

/** visit 이벤트 — 세션당 하루 1회만 기록 */
export function trackVisit(path: string): void {
  if (typeof window === "undefined") return;
  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem(VISIT_KEY) === today) return;
  localStorage.setItem(VISIT_KEY, today);
  track("visit", { path });
}
