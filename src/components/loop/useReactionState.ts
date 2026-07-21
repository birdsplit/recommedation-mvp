"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  isSessionCriteria,
  type ReactionLog,
  type SessionCriteria,
} from "@/lib/reco/criteria";

/**
 * 반응 루프(arm B) 세션 상태 — 카드 반응·확정 기준·제외/저장/보류·최근 설명을
 * sessionStorage(`modoo_loop_state_v1`)에 여정 단위로 보존한다.
 *
 * - 여정 스코프: 저장값에 journeyId를 함께 담고, 현재 modoo_journey_id와 다르면 리셋한다.
 * - 하이드레이션 안전: useSyncExternalStore로 SSR/최초 렌더는 빈 스냅샷을 쓰고
 *   커밋 후 저장값으로 전환한다(하이드레이션 불일치·effect 내 setState 없이).
 * - 저장 실패(private mode·quota)에도 in-memory 스냅샷이 권위 있어 흐름이 끊기지 않는다.
 */

export interface LoopState {
  reactions: ReactionLog;
  criteria: SessionCriteria;
  answeredSuggestionIds: string[];
  excludedIds: string[];
  savedIds: string[];
  heldIds: string[];
  lastExplanations: string[];
}

const STORAGE_KEY = "modoo_loop_state_v1";
const JOURNEY_KEY = "modoo_journey_id";

const SERVER_EMPTY: LoopState = {
  reactions: [],
  criteria: { must: [], prefer: [], tolerated: [] },
  answeredSuggestionIds: [],
  excludedIds: [],
  savedIds: [],
  heldIds: [],
  lastExplanations: [],
};

function emptyLoopState(): LoopState {
  return {
    reactions: [],
    criteria: { must: [], prefer: [], tolerated: [] },
    answeredSuggestionIds: [],
    excludedIds: [],
    savedIds: [],
    heldIds: [],
    lastExplanations: [],
  };
}

function currentJourneyId(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(JOURNEY_KEY) ?? "";
  } catch {
    return "";
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** 저장값을 방어적으로 되살린다. 형태가 어긋나면 null → 호출부가 빈 상태로 폴백한다. */
function reviveState(raw: unknown): LoopState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (!Array.isArray(row.reactions)) return null;
  if (!isSessionCriteria(row.criteria)) return null;
  if (
    !isStringArray(row.answeredSuggestionIds) ||
    !isStringArray(row.excludedIds) ||
    !isStringArray(row.savedIds) ||
    !isStringArray(row.heldIds) ||
    !isStringArray(row.lastExplanations)
  ) {
    return null;
  }
  const reactions = row.reactions.filter(
    (item) => !!item && typeof item === "object" && !Array.isArray(item)
  ) as ReactionLog;
  return {
    reactions,
    criteria: row.criteria,
    answeredSuggestionIds: row.answeredSuggestionIds,
    excludedIds: row.excludedIds,
    savedIds: row.savedIds,
    heldIds: row.heldIds,
    lastExplanations: row.lastExplanations,
  };
}

function loadFromStorage(journeyId: string): LoopState {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as {
        journeyId?: unknown;
        state?: unknown;
      };
      if (parsed && parsed.journeyId === journeyId) {
        const revived = reviveState(parsed.state);
        if (revived) return revived;
      }
    }
  } catch {
    // 손상·미지원 저장소는 무시하고 빈 상태로 시작한다
  }
  return emptyLoopState();
}

// 탭 단위 in-memory 스토어 (sessionStorage는 탭 간 공유되지 않는다).
const listeners = new Set<() => void>();
let store: LoopState | null = null;
let storeJourney: string | null = null;

function getSnapshot(): LoopState {
  const journeyId = currentJourneyId();
  if (store !== null && storeJourney === journeyId) return store;
  store = loadFromStorage(journeyId);
  storeJourney = journeyId;
  return store;
}

function getServerSnapshot(): LoopState {
  return SERVER_EMPTY;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function persist(next: LoopState): void {
  const journeyId = currentJourneyId();
  store = next;
  storeJourney = journeyId;
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ journeyId, state: next })
    );
  } catch {
    // 저장 실패는 무시 — in-memory 스냅샷이 권위 있다
  }
  for (const listener of listeners) listener();
}

export function useReactionState(): [LoopState, (next: LoopState) => void] {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setState = useCallback((next: LoopState) => persist(next), []);
  return [state, setState];
}
