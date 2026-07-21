import type { EventType } from "@/lib/constants";
import { isUuid } from "@/lib/uuid";

/**
 * 익명 세션 이벤트 트래킹 (클라이언트 전용).
 * - 브라우저 id: localStorage의 UUID(30일). /go/[id] 서버 핸들러가
 *   outbound_click을 귀속시킬 수 있도록 쿠키(sid)에도 미러링한다.
 * - journey id: 질문 시작부터 한 번의 추천 검증이 끝날 때까지 유지한다.
 * - run id: 저장된 추천 실행이 있으면 이후 상세·비교·피드백에 함께 보낸다.
 * - 전송: sendBeacon 우선(페이지 이탈에도 유실 최소화), 실패 시 keepalive fetch.
 *   실패해도 사용자 흐름을 막지 않는다.
 */

const SID_KEY = "modoo_sid";
const SID_CREATED_AT_KEY = "modoo_sid_created_at";
const JOURNEY_KEY = "modoo_journey_id";
const RUN_KEY = "modoo_run_id";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1_000;

function safeStorage(storage: "local" | "session"): Storage | null {
  try {
    return storage === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function getSessionId(): string {
  if (typeof window === "undefined") return "";
  const storage = safeStorage("local");
  let sid: string | null = null;
  const createdAt = Number(storage?.getItem(SID_CREATED_AT_KEY) ?? "0");
  const expired =
    !Number.isFinite(createdAt) || Date.now() - createdAt > THIRTY_DAYS_MS;
  sid = storage?.getItem(SID_KEY) ?? null;
  if (!isUuid(sid) || expired) {
    sid = crypto.randomUUID();
    try {
      storage?.setItem(SID_KEY, sid);
      storage?.setItem(SID_CREATED_AT_KEY, String(Date.now()));
    } catch {
      // private mode 등에서 저장 실패 시 쿠키만 사용한다.
    }
  }
  document.cookie = `sid=${sid}; path=/; max-age=2592000; samesite=lax`;
  return sid;
}

/** 현재 추천 여정. 새 질문 시작 시 reset=true로 새 id를 발급한다. */
export function getJourneyId(reset = false): string {
  if (typeof window === "undefined") return "";
  const storage = safeStorage("session");
  let journeyId = reset ? null : storage?.getItem(JOURNEY_KEY) ?? null;
  if (!isUuid(journeyId)) {
    journeyId = crypto.randomUUID();
    storage?.setItem(JOURNEY_KEY, journeyId);
    if (reset) storage?.removeItem(RUN_KEY);
  }
  document.cookie = `jid=${journeyId}; path=/; max-age=2592000; samesite=lax`;
  return journeyId;
}

export function setCurrentRunId(runId: string | null): void {
  if (typeof window === "undefined") return;
  const storage = safeStorage("session");
  if (isUuid(runId)) storage?.setItem(RUN_KEY, runId);
  else storage?.removeItem(RUN_KEY);
}

export function getCurrentRunId(): string | null {
  if (typeof window === "undefined") return null;
  const value = safeStorage("session")?.getItem(RUN_KEY) ?? null;
  return isUuid(value) ? value : null;
}

export interface TrackContext {
  runId?: string | null;
  cohort?: string | null;
}

export function track(
  eventType: EventType,
  payload: Record<string, unknown> = {},
  context: TrackContext = {}
): void {
  if (typeof window === "undefined") return;
  try {
    const journeyId = getJourneyId();
    const runId = isUuid(context.runId)
      ? context.runId
      : getCurrentRunId();
    if (runId) setCurrentRunId(runId);
    const body = JSON.stringify({
      session_id: getSessionId(),
      journey_id: journeyId,
      run_id: runId,
      event_version: 2,
      cohort:
        typeof context.cohort === "string" && context.cohort.trim() !== ""
          ? context.cohort.trim().slice(0, 80)
          : null,
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

/** 랜딩 진입마다 새 추천 여정을 시작하고 visit과 start가 같은 id를 쓰게 한다. */
export function trackVisit(path: string): void {
  if (typeof window === "undefined") return;
  getJourneyId(true);
  track("visit", { path });
}
