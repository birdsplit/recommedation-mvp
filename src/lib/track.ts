import type { EventType } from "@/lib/constants";
import {
  getAssignedMode,
  MODE_STORAGE_KEY,
  persistMode,
} from "@/lib/experiment";
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
    // cohort 인자를 넘기지 않는 호출부(arm-A 포함)는 배정된 실험 모드를 자동으로 싣는다.
    // getAssignedMode는 클라이언트 안전 모듈이고, 여기는 위 SSR 가드를 통과한 브라우저 전용
    // 경로라 지연 호출한다. 명시적으로 넘긴 cohort(문자열/null)는 그대로 존중한다.
    // (서버 /api/events는 study용 modoo_cohort 쿠키가 있으면 이 값을 덮어쓴다 — 그대로 둔다.)
    const resolvedCohort =
      context.cohort === undefined ? getAssignedMode() : context.cohort;
    const body = JSON.stringify({
      session_id: getSessionId(),
      journey_id: journeyId,
      run_id: runId,
      event_version: 2,
      cohort:
        typeof resolvedCohort === "string" && resolvedCohort.trim() !== ""
          ? resolvedCohort.trim().slice(0, 80)
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
  const journeyId = getJourneyId(true);
  // 여정별 배정 고정(per-journey stickiness): 새 여정을 시작할 때 세션에 저장된 모드를
  // 지워 이번 여정의 팔을 새로 정한다. 다만 ?mode= 쿼리와 study(modoo_cohort) 오버라이드는
  // getAssignedMode 우선순위(query > session > cookie > hash)에서 여전히 우선하므로,
  // QA·스터디 링크로 지정한 팔은 세션 정리 뒤에도 유지된다.
  safeStorage("session")?.removeItem(MODE_STORAGE_KEY);
  // 이번 여정의 팔을 한 번만 정해 고정하고, 곧바로 fire하는 visit부터 같은 코호트를
  // 자동 주입(track 내부)으로 싣게 한다.
  persistMode(getAssignedMode(journeyId));
  track("visit", { path });
}
