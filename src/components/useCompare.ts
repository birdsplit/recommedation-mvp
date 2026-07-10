"use client";

import { useCallback, useEffect, useState } from "react";
import { COMPARE_MAX } from "@/lib/constants";

const KEY = "modoo_compare";

/** 비교함 (기획서 §7.1) — 로그인 없이 localStorage에 최대 3개 저장 */

export function readCompareIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw.filter((v): v is string => typeof v === "string").slice(0, COMPARE_MAX)
      : [];
  } catch {
    return [];
  }
}

function writeCompareIds(ids: string[]): void {
  localStorage.setItem(KEY, JSON.stringify(ids.slice(0, COMPARE_MAX)));
  window.dispatchEvent(new Event("modoo-compare-change"));
}

export function useCompare() {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => setIds(readCompareIds());
    sync();
    window.addEventListener("modoo-compare-change", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("modoo-compare-change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const add = useCallback((id: string): "added" | "exists" | "full" => {
    const current = readCompareIds();
    if (current.includes(id)) return "exists";
    if (current.length >= COMPARE_MAX) return "full";
    writeCompareIds([...current, id]);
    return "added";
  }, []);

  const remove = useCallback((id: string) => {
    writeCompareIds(readCompareIds().filter((v) => v !== id));
  }, []);

  return { ids, add, remove, has: (id: string) => ids.includes(id) };
}
