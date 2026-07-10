"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { EventType } from "@/lib/constants";
import { track, trackVisit } from "@/lib/track";

/** 마운트 시 이벤트 1회 기록 */
export function EventOnMount({
  type,
  payload,
}: {
  type: EventType;
  payload?: Record<string, unknown>;
}) {
  const eventKey = `${type}:${JSON.stringify(payload ?? {})}`;
  const firedKey = useRef<string | null>(null);
  useEffect(() => {
    if (firedKey.current === eventKey) return;
    firedKey.current = eventKey;
    track(type, payload);
  }, [eventKey, payload, type]);
  return null;
}

/** 랜딩 방문 기록 (세션당 하루 1회) */
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
}: {
  event: EventType;
  payload?: Record<string, unknown>;
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={className} onClick={() => track(event, payload)}>
      {children}
    </Link>
  );
}
