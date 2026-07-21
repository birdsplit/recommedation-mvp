import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { track, trackVisit } from "@/lib/track";
import { hashAssign } from "@/lib/experiment";

/**
 * track()의 코호트 자동 주입을 검증한다. suite 기본 환경은 node라 jsdom 없이
 * 브라우저 전역(window/document/navigator/crypto/fetch)을 최소한으로 스텁한다.
 * sendBeacon을 제공하지 않아 track이 fetch 경로로 떨어지고, 그 body를 파싱해 확인한다.
 */

const FIXED_JOURNEY = "00000000-0000-4000-8000-000000000001";

function makeStorage(map: Map<string, string>): Storage {
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => map.set(key, String(value)),
    removeItem: (key: string) => map.delete(key),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  } as Storage;
}

const local = new Map<string, string>();
const session = new Map<string, string>();
let fetchMock: ReturnType<typeof vi.fn>;

function lastBody(): Record<string, unknown> {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error("fetch가 호출되지 않았습니다");
  return JSON.parse((call[1] as { body: string }).body);
}

beforeEach(() => {
  local.clear();
  session.clear();
  fetchMock = vi.fn(() => Promise.resolve());
  vi.stubGlobal("window", {
    localStorage: makeStorage(local),
    sessionStorage: makeStorage(session),
    location: { search: "" },
  });
  vi.stubGlobal("document", { cookie: "" });
  vi.stubGlobal("navigator", {}); // sendBeacon 없음 → fetch 경로 사용
  vi.stubGlobal("crypto", {
    randomUUID: () => "00000000-0000-4000-8000-000000000009",
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("track — 코호트 자동 주입", () => {
  it("cohort 인자가 없으면 배정된 실험 모드를 자동으로 싣는다", () => {
    session.set("modoo_journey_id", FIXED_JOURNEY);

    track("results_view", {});

    const body = lastBody();
    expect(["oneshot", "loop"]).toContain(body.cohort);
    // 쿼리·세션·쿠키 모드가 없으므로 journeyId 해시 배정과 일치한다
    expect(body.cohort).toBe(hashAssign(FIXED_JOURNEY));
  });

  it("명시적으로 넘긴 cohort 문자열은 그대로 보존한다", () => {
    session.set("modoo_journey_id", FIXED_JOURNEY);

    track("results_view", {}, { cohort: "loop" });

    expect(lastBody().cohort).toBe("loop");
  });

  it("명시적 null cohort는 자동 주입 없이 null로 보존한다", () => {
    session.set("modoo_journey_id", FIXED_JOURNEY);

    track("results_view", {}, { cohort: null });

    expect(lastBody().cohort).toBeNull();
  });

  it("세션 모드가 있으면 그 배정을 자동 주입한다", () => {
    session.set("modoo_journey_id", FIXED_JOURNEY);
    session.set("modoo_mode", "loop"); // getAssignedMode 우선순위: session > hash

    track("results_view", {});

    expect(lastBody().cohort).toBe("loop");
  });
});

describe("trackVisit — 여정별 배정 고정", () => {
  it("이전 여정의 세션 모드를 지우고 새 배정을 visit에 싣는다", () => {
    session.set("modoo_mode", "loop"); // 이전 여정 잔재

    trackVisit("/");

    const body = lastBody();
    expect(body.event_type).toBe("visit");
    expect(["oneshot", "loop"]).toContain(body.cohort);
    // 새로 배정·persist된 세션 모드와 visit이 싣는 코호트가 일치한다
    expect(session.get("modoo_mode")).toBe(body.cohort);
  });
});
