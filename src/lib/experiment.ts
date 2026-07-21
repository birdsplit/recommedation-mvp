import type { ExperimentMode } from "@/lib/constants";

/**
 * A/B 실험 모드 배정 (기획 개정 §12) — 클라이언트 안전 순수 모듈.
 *
 * 우선순위: URL ?mode= > sessionStorage > 쿠키 > journeyId 해시 배정.
 * 배정은 journeyId의 결정적 해시라 같은 사용자는 항상 같은 팔을 받는다
 * (Date.now()/Math.random() 사용 안 함). server-only·track.ts를 import하지 않아
 * 클라이언트·서버 어디서든 쓸 수 있고 순환 의존이 없다.
 */

export const MODE_STORAGE_KEY = "modoo_mode";
export const MODE_COOKIE = "modoo_mode";
/** track.ts가 설정하는 여정 id 키 — 순환 방지를 위해 직접 읽는다 */
const JOURNEY_STORAGE_KEY = "modoo_journey_id";

function coerceMode(value: string | null | undefined): ExperimentMode | null {
  return value === "oneshot" || value === "loop" ? value : null;
}

/**
 * journeyId를 FNV-1a 32비트로 해싱한 뒤 아발란치 믹스를 거쳐 짝/홀로 두 팔에 배정한다.
 * 결정적이고 외부 의존이 없다. FNV-1a의 최하위 비트는 바이트 패리티에 치우쳐 있어
 * 구조적 입력에서 %2 분포가 쏠릴 수 있으므로, lowbias32 finalizer로 비트를 고르게 섞은 뒤
 * %2를 취한다(UUID 같은 실제 입력은 물론 임의 문자열에서도 약 50/50 유지).
 * 빈 문자열도 유효한 입력이다(안정적인 폴백 배정을 준다).
 */
export function hashAssign(seed: string): ExperimentMode {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime, 오버플로는 imul로 32비트 유지
  }
  // lowbias32 finalizer — 하위 비트까지 고르게 아발란치
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return (hash >>> 0) % 2 === 0 ? "oneshot" : "loop";
}

/**
 * 여러 출처에서 모드를 결정한다 — 순수 함수라 단위 테스트가 쉽다.
 * query/session/cookie는 유효한 모드 문자열일 때만 채택하고, 없으면 journeyId 해시로 배정한다.
 */
export function resolveModeFromSources(sources: {
  query?: string | null;
  session?: string | null;
  cookie?: string | null;
  journeyId: string;
}): ExperimentMode {
  return (
    coerceMode(sources.query) ??
    coerceMode(sources.session) ??
    coerceMode(sources.cookie) ??
    hashAssign(sources.journeyId)
  );
}

function safeSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readQueryMode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return new URLSearchParams(window.location.search).get("mode");
  } catch {
    return null;
  }
}

function readSessionMode(): string | null {
  if (typeof window === "undefined") return null;
  return safeSessionStorage()?.getItem(MODE_STORAGE_KEY) ?? null;
}

function readJourneyId(): string | null {
  if (typeof window === "undefined") return null;
  return safeSessionStorage()?.getItem(JOURNEY_STORAGE_KEY) ?? null;
}

function readCookieMode(): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${MODE_COOKIE}=`;
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!match) return null;
  try {
    return decodeURIComponent(match.slice(prefix.length));
  } catch {
    return null;
  }
}

/**
 * 브라우저에서 배정된 모드를 읽는다. 모든 브라우저 API는 SSR 가드가 걸려 있다.
 * journeyId를 인자로 받으면 그것을, 없으면 sessionStorage의 modoo_journey_id를 쓴다.
 * 아직 여정 id가 없으면 빈 문자열 해시로 폴백한다(track.ts를 import하지 않기 위한 선택 —
 * 여정 시작 전 배정은 안정적 폴백으로 처리하고, 여정 시작 후 persistMode로 고정한다).
 */
export function getAssignedMode(journeyId?: string): ExperimentMode {
  const jid = journeyId ?? readJourneyId() ?? "";
  if (typeof window === "undefined") {
    return hashAssign(jid);
  }
  return resolveModeFromSources({
    query: readQueryMode(),
    session: readSessionMode(),
    cookie: readCookieMode(),
    journeyId: jid,
  });
}

/**
 * 배정된 모드를 sessionStorage와 세션 쿠키(만료 없음, non-HttpOnly, path=/, sameSite=lax)에
 * 고정한다. 저장 실패해도(private mode 등) 조용히 넘어가 사용자 흐름을 막지 않는다.
 */
export function persistMode(mode: ExperimentMode): void {
  if (typeof window === "undefined") return;
  try {
    safeSessionStorage()?.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // 저장 실패 시 쿠키만 사용
  }
  if (typeof document !== "undefined") {
    document.cookie = `${MODE_COOKIE}=${mode}; path=/; samesite=lax`;
  }
}
