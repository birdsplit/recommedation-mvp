"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { EventType } from "@/lib/constants";
import { track, trackVisit } from "@/lib/track";

/** 마운트 시 이벤트 1회 기록 */
export function EventOnMount({
  type,
  payload,
  runId,
}: {
  type: EventType;
  payload?: Record<string, unknown>;
  runId?: string | null;
}) {
  const eventKey = `${type}:${runId ?? ""}:${JSON.stringify(payload ?? {})}`;
  const firedKey = useRef<string | null>(null);
  useEffect(() => {
    if (firedKey.current === eventKey) return;
    firedKey.current = eventKey;
    track(type, payload, { runId });
  }, [eventKey, payload, runId, type]);
  return null;
}

/** 랜딩 방문 기록과 새 추천 여정 시작 */
export function VisitTracker({ path }: { path: string }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    trackVisit(path);
  }, [path]);
  return null;
}

/** 클릭 시 이벤트를 남기는 링크 */
export function TrackedLink({
  event,
  payload,
  href,
  className,
  children,
  runId,
}: {
  event: EventType;
  payload?: Record<string, unknown>;
  href: string;
  className?: string;
  children: React.ReactNode;
  runId?: string | null;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => track(event, payload, { runId })}
    >
      {children}
    </Link>
  );
}
