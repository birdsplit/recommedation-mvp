"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Answers } from "@/lib/reco/types";
import { getJourneyId, getSessionId, setCurrentRunId } from "@/lib/track";
import { ArrowRightIcon } from "@/components/icons";

export function CreateRecommendationButton({
  answers,
  label = "이 조건으로 3개 보기",
}: {
  answers: Answers;
  label?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers,
          session_id: getSessionId(),
          journey_id: getJourneyId(),
        }),
      });
      if (!response.ok) throw new Error(`recommendations ${response.status}`);
      const data = (await response.json()) as {
        run_id?: unknown;
        results_url?: unknown;
      };
      if (typeof data.results_url !== "string") throw new Error("missing url");
      setCurrentRunId(typeof data.run_id === "string" ? data.run_id : null);
      router.push(data.results_url);
    } catch {
      setError(
        "추천을 만들지 못했어요. 실데이터 카탈로그 또는 데이터베이스 연결 상태를 확인해 주세요."
      );
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={create}
        disabled={loading}
        aria-describedby={error ? "recommendation-create-error" : undefined}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#C8431B] to-[#A82E0C] py-[18px] text-[18px] font-extrabold text-white shadow-cta disabled:cursor-wait disabled:opacity-70"
      >
        {loading ? "후보를 판단하는 중…" : label}
        {!loading && <ArrowRightIcon size={18} />}
      </button>
      <p aria-live="polite" className="sr-only">
        {loading ? "추천 후보를 판단하고 있습니다." : ""}
      </p>
      {error && (
        <p
          id="recommendation-create-error"
          role="alert"
          className="mt-3 rounded-2xl bg-[#FCE8E4] px-4 py-3 text-center text-[13px] font-bold leading-relaxed text-coral-700"
        >
          {error}
        </p>
      )}
    </div>
  );
}
