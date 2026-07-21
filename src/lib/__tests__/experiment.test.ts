import { describe, expect, it } from "vitest";
import {
  getAssignedMode,
  hashAssign,
  persistMode,
  resolveModeFromSources,
} from "@/lib/experiment";
import { EXPERIMENT_MODES } from "@/lib/constants";

describe("resolveModeFromSources — 우선순위", () => {
  const jid = "journey-abc";

  it("query > session > cookie > 해시 배정 순으로 우선한다", () => {
    expect(
      resolveModeFromSources({ query: "loop", session: "oneshot", cookie: "oneshot", journeyId: jid })
    ).toBe("loop");
    expect(
      resolveModeFromSources({ query: null, session: "loop", cookie: "oneshot", journeyId: jid })
    ).toBe("loop");
    expect(
      resolveModeFromSources({ query: null, session: null, cookie: "oneshot", journeyId: jid })
    ).toBe("oneshot");
    // 아무 출처도 없으면 journeyId 해시로 배정 (결정적)
    expect(
      resolveModeFromSources({ query: null, session: null, cookie: null, journeyId: jid })
    ).toBe(hashAssign(jid));
  });

  it("무효한 모드 문자열은 무시하고 다음 출처로 넘어간다", () => {
    expect(
      resolveModeFromSources({ query: "garbage", session: "loop", cookie: null, journeyId: jid })
    ).toBe("loop");
    expect(
      resolveModeFromSources({ query: "", session: undefined, cookie: "loop", journeyId: jid })
    ).toBe("loop");
    // 전부 무효면 해시 폴백
    expect(
      resolveModeFromSources({ query: "x", session: "y", cookie: "z", journeyId: jid })
    ).toBe(hashAssign(jid));
  });
});

describe("hashAssign — 결정성과 분포", () => {
  it("같은 입력은 항상 같은 팔을 준다", () => {
    for (const seed of ["a", "journey-1", "", "550e8400-e29b-41d4-a716-446655440000"]) {
      expect(hashAssign(seed)).toBe(hashAssign(seed));
      expect(EXPERIMENT_MODES).toContain(hashAssign(seed));
    }
  });

  it("빈 문자열도 결정적으로 배정된다", () => {
    expect(hashAssign("")).toBe(hashAssign(""));
  });

  it("합성 id 1000개에서 약 50/50으로 갈린다(40~60%)", () => {
    let loop = 0;
    for (let i = 0; i < 1000; i += 1) {
      // UUID 유사 합성 id — 실제 journeyId(UUID) 분포를 모사
      const id = `id-${i}-${(i * 2654435761) >>> 0}`;
      if (hashAssign(id) === "loop") loop += 1;
    }
    expect(loop).toBeGreaterThanOrEqual(400);
    expect(loop).toBeLessThanOrEqual(600);
  });
});

describe("getAssignedMode / persistMode — SSR 안전성", () => {
  it("window가 없으면(SSR) journeyId 해시로 폴백한다", () => {
    // 테스트 환경(node)에는 window가 없다
    expect(typeof window).toBe("undefined");
    expect(getAssignedMode("journey-xyz")).toBe(hashAssign("journey-xyz"));
    // journeyId가 없으면 빈 문자열 해시 폴백
    expect(getAssignedMode()).toBe(hashAssign(""));
  });

  it("persistMode는 SSR에서 예외 없이 무시된다", () => {
    expect(() => persistMode("loop")).not.toThrow();
  });
});
