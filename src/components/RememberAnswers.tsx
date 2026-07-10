"use client";

import { useEffect } from "react";

export const LAST_QUERY_KEY = "modoo_last_query";
export const LAST_CANDIDATES_KEY = "modoo_last_candidates";

/**
 * 결과 화면의 답변 쿼리와 후보 id를 세션에 기억해,
 * 쿼리 없이 진입한 비교함·피드백 화면이 조건을 이어받게 한다.
 */
export function RememberAnswers({
  query,
  candidateIds,
}: {
  query: string;
  candidateIds?: string[];
}) {
  useEffect(() => {
    try {
      sessionStorage.setItem(LAST_QUERY_KEY, query);
      if (candidateIds) {
        sessionStorage.setItem(LAST_CANDIDATES_KEY, JSON.stringify(candidateIds));
      }
    } catch {
      // 저장 실패는 무시
    }
  }, [query, candidateIds]);
  return null;
}

export function loadLastQuery(): string {
  if (typeof window === "undefined") return "";
  try {
    return sessionStorage.getItem(LAST_QUERY_KEY) ?? "";
  } catch {
    return "";
  }
}

export function loadLastCandidateIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(sessionStorage.getItem(LAST_CANDIDATES_KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}
