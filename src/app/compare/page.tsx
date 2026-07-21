"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Product, Recommendation } from "@/lib/reco/types";
import { hasAnswers, parseAnswers } from "@/lib/reco/answers";
import { evaluateProduct } from "@/lib/reco/engine";
import { COMPARE_MAX } from "@/lib/constants";
import { useCompare, readCompareIds } from "@/components/useCompare";
import { loadLastQuery } from "@/components/RememberAnswers";
import { TierBadge } from "@/components/TierBadge";
import { SellerLinkButton } from "@/components/SellerLinkButton";
import { buildCheckItems } from "@/lib/check-items";
import { BackIcon, XCircleIcon } from "@/components/icons";
import { COMPARE_ROWS } from "./rows";

/** 화면8 — 상품 비교 (기획서 §7.1, 최대 3개·차이 강조·필수조건 미충족 경고) */
export default function ComparePage() {
  return (
    <Suspense fallback={null}>
      <CompareContent />
    </Suspense>
  );
}

// ---------- 브라우저 저장소 구독 (SSR 안전) ----------

/** 비교함 id 목록 — useCompare와 같은 이벤트를 구독해 항상 최신 값을 읽는다 */
function subscribeCompare(cb: () => void): () => void {
  window.addEventListener("modoo-compare-change", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("modoo-compare-change", cb);
    window.removeEventListener("storage", cb);
  };
}
const getCompareSnapshot = () => readCompareIds().join(",");
/** 마지막 답변 쿼리(sessionStorage) — 이 화면에 있는 동안엔 바뀌지 않는다 */
const noopSubscribe = () => () => {};
const getServerSnapshot = () => "";

type FetchState =
  | { status: "ok"; key: string; products: Product[] }
  | { status: "error"; key: string };

function CompareContent() {
  const sp = useSearchParams();
  const spString = sp.toString();

  const idsKey = useSyncExternalStore(
    subscribeCompare,
    getCompareSnapshot,
    getServerSnapshot
  );
  const ids = useMemo(() => (idsKey === "" ? [] : idsKey.split(",")), [idsKey]);
  const { remove } = useCompare();

  // 답변 쿼리 — URL에 없으면 결과 화면이 기억해 둔 마지막 쿼리로 폴백
  const lastQuery = useSyncExternalStore(
    noopSubscribe,
    loadLastQuery,
    getServerSnapshot
  );
  const query = useMemo(() => {
    const spObj = Object.fromEntries(new URLSearchParams(spString));
    if (hasAnswers(spObj)) return spString;
    const lastQueryObject = Object.fromEntries(new URLSearchParams(lastQuery));
    return hasAnswers(lastQueryObject) ? lastQuery : "";
  }, [spString, lastQuery]);
  const answers = useMemo(
    () => parseAnswers(Object.fromEntries(new URLSearchParams(query))),
    [query]
  );

  // 상품 로드 — 공개 상품만 돌아오므로, 빠진 id는 비교함에서 조용히 제거
  const [fetchState, setFetchState] = useState<FetchState | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (idsKey === "") return;
    let cancelled = false;
    const requested = idsKey.split(",");

    fetch(`/api/products?ids=${idsKey}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { products?: Product[] };
        if (cancelled) return;
        const list = Array.isArray(data.products) ? data.products : [];
        setFetchState({ status: "ok", key: idsKey, products: list });
        // 응답이 정상일 때만 비공개로 바뀐 id를 제거 (오류 시엔 보존)
        const returned = new Set(list.map((p) => p.id));
        requested.filter((id) => !returned.has(id)).forEach(remove);
      })
      .catch(() => {
        if (!cancelled) setFetchState({ status: "error", key: idsKey });
      });
    return () => {
      cancelled = true;
    };
  }, [idsKey, remove, retryKey]);

  const recs = useMemo(() => {
    if (!query || fetchState?.status !== "ok") return [];
    const byId = new Map(fetchState.products.map((p) => [p.id, p] as const));
    return ids
      .map((id) => byId.get(id))
      .filter((p): p is Product => p !== undefined)
      .map((p) => evaluateProduct(p, answers));
  }, [fetchState, ids, answers, query]);

  const backHref = query ? `/results?${query}` : "/";
  const resultsHref = query ? `/results?${query}` : "/q/1";

  let content: ReactNode;
  if (ids.length === 0) {
    content = <EmptyCard resultsHref={resultsHref} />;
  } else if (!query) {
    content = <MissingConditionsCard />;
  } else if (fetchState === null || fetchState.key !== idsKey) {
    content = (
      <p className="px-6 pt-10 text-center text-[13.5px] font-medium text-faint">
        비교함을 불러오고 있어요…
      </p>
    );
  } else if (fetchState.status === "error") {
    content = (
      <ErrorCard
        onRetry={() => {
          setFetchState(null);
          setRetryKey((k) => k + 1);
        }}
      />
    );
  } else {
    content = (
      <>
        <CompareTable recs={recs} query={query} onRemove={remove} />
        <p className="mt-3 px-6 text-[13px] font-medium leading-relaxed text-faint">
          🍑 &ldquo;차이&rdquo; 표시와 살구색 줄은 상품마다 값이 다른
          항목이에요. &ldquo;+별도&rdquo;는 판매처에서 확인이 필요한 비용이
          남아 있다는 뜻이에요.
        </p>
      </>
    );
  }

  return (
    <main className="min-h-dvh pb-12">
      {/* 상단 바 */}
      <div className="flex items-center gap-3 px-5 pt-6">
        <Link
          href={backHref}
          aria-label="추천 결과로 돌아가기"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-soft"
        >
          <BackIcon size={18} />
        </Link>
        <h1 className="text-[18px] font-extrabold">비교함</h1>
        <span className="ml-auto rounded-full bg-white px-3 py-1.5 text-[13px] font-extrabold text-coral-700 shadow-soft">
          {ids.length}/{COMPARE_MAX}
        </span>
      </div>

      {content}
    </main>
  );
}

function MissingConditionsCard() {
  return (
    <div role="status" className="mx-5 mt-6 rounded-[28px] bg-white p-8 text-center shadow-card">
      <p className="text-[38px]">🧭</p>
      <h2 className="mt-2 text-[18px] font-extrabold">
        비교할 생활조건을 다시 알려주세요
      </h2>
      <p className="mt-2 text-[13.5px] leading-relaxed text-sub">
        담아둔 상품은 그대로 있어요. 질문 3개에 다시 답하면 현재 조건으로
        추천 수준과 최종 판단을 정확하게 비교해드릴게요.
      </p>
      <Link
        href="/q/1"
        className="mt-5 inline-block rounded-full bg-gradient-to-r from-[#C8431B] to-[#A82E0C] px-8 py-3.5 text-[15px] font-extrabold text-white shadow-cta"
      >
        생활조건 다시 입력하기
      </Link>
    </div>
  );
}

function EmptyCard({ resultsHref }: { resultsHref: string }) {
  return (
    <div role="status" className="mx-5 mt-6 rounded-[28px] bg-white p-8 text-center shadow-card">
      <p className="text-[38px]">🛏️</p>
      <h2 className="mt-2 text-[18px] font-extrabold">비교함이 비어 있어요</h2>
      <p className="mt-2 text-[13.5px] leading-relaxed text-sub">
        추천 결과에서 &ldquo;비교함에 담기&rdquo;를 누르면 최대 {COMPARE_MAX}
        개까지 나란히 비교할 수 있어요.
      </p>
      <Link
        href={resultsHref}
        className="mt-5 inline-block rounded-full bg-gradient-to-r from-[#C8431B] to-[#A82E0C] px-8 py-3.5 text-[15px] font-extrabold text-white shadow-cta"
      >
        추천 결과 보러 가기
      </Link>
    </div>
  );
}

function ErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="mx-5 mt-6 rounded-[28px] bg-white p-8 text-center shadow-card">
      <p className="text-[34px]">😢</p>
      <h2 className="mt-2 text-[17px] font-extrabold">
        상품 정보를 불러오지 못했어요
      </h2>
      <p className="mt-2 text-[13.5px] leading-relaxed text-sub">
        네트워크 상태를 확인하고 다시 시도해 주세요. 담아둔 상품은 그대로
        있어요.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 rounded-full bg-gradient-to-r from-[#C8431B] to-[#A82E0C] px-8 py-3.5 text-[15px] font-extrabold text-white shadow-cta"
      >
        다시 시도
      </button>
    </div>
  );
}

/** 비교표 — 행 고정 11개, 열 = 상품(최대 3), 가로 스크롤 */
function CompareTable({
  recs,
  query,
  onRemove,
}: {
  recs: Recommendation[];
  query: string;
  onRemove: (id: string) => void;
}) {
  return (
    <div
      className="mt-4 ml-5 overflow-x-auto rounded-l-[28px] bg-white py-4 pr-4 shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B382F]"
      role="region"
      aria-label="선택한 상품 비교표. 좌우로 스크롤해 모든 상품을 확인할 수 있습니다."
      tabIndex={0}
    >
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th
              className="sticky left-0 z-10 bg-white pl-4"
              aria-label="비교 항목"
            />
            {recs.map((rec) => {
              const p = rec.product;
              const feedbackParams = new URLSearchParams(query);
              feedbackParams.set("chosen", p.id);
              return (
                <th
                  key={p.id}
                  className="min-w-[136px] max-w-[160px] px-1.5 pb-3 text-left align-top font-normal"
                >
                  {rec.tier === "not_fit" && (
                    <span className="mb-1.5 inline-block rounded-full bg-coral-700 px-2.5 py-1 text-[13px] font-extrabold text-white">
                      내 필수조건 미충족
                    </span>
                  )}
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-[13px] font-extrabold leading-snug">
                      {p.name}
                    </p>
                    <button
                      type="button"
                      onClick={() => onRemove(p.id)}
                      aria-label={`${p.name} 비교함에서 빼기`}
                      className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#CFC2B3]"
                    >
                      <XCircleIcon size={18} />
                    </button>
                  </div>
                  <div className="mt-1.5">
                    <TierBadge tier={rec.tier} />
                  </div>
                  <Link
                    href={`/products/${p.id}${query ? `?${query}` : ""}`}
                    className="mt-2 flex items-center justify-center rounded-full border-2 border-peach-200 bg-white py-1.5 text-[13px] font-bold text-coral-700"
                  >
                    자세히 보기
                  </Link>
                  <SellerLinkButton
                    productId={p.id}
                    via="compare"
                    checkItems={buildCheckItems({
                      unknownParts: rec.cost.unknownParts,
                      scheduledDelivery: p.scheduled_delivery,
                      hasExtraCostRisk: p.review_risks.includes("extra_cost"),
                    })}
                    className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-full bg-[#F4EDE3] py-1.5 text-[13px] font-bold text-[#4A4038]"
                  />
                  <Link
                    href={`/feedback?${feedbackParams.toString()}`}
                    className="mt-1.5 flex items-center justify-center rounded-full bg-coral-700 py-1.5 text-[13px] font-extrabold text-white"
                  >
                    이 상품 선택
                  </Link>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {COMPARE_ROWS.map((row) => {
            const differs =
              recs.length > 1 &&
              new Set(recs.map((rec) => row.diffKey(rec))).size > 1;
            const bg = differs ? "bg-peach-50" : "bg-white";
            return (
              <tr key={row.label}>
                <th
                  scope="row"
                  className={`sticky left-0 z-10 border-t border-[#F6EEE4] py-2.5 pr-2 pl-4 text-left align-top text-[13px] font-bold whitespace-nowrap text-faint ${bg}`}
                >
                  <span className="flex items-center gap-1.5">
                    {row.label}
                    {differs && (
                      <span className="rounded-full bg-coral-600 px-1.5 py-0.5 text-[9.5px] font-extrabold text-white">
                        차이
                      </span>
                    )}
                  </span>
                </th>
                {recs.map((rec) => (
                  <td
                    key={rec.product.id}
                    className={`border-t border-[#F6EEE4] px-1.5 py-2.5 align-top text-[13px] leading-snug font-semibold ${
                      differs ? "bg-peach-50" : ""
                    }`}
                  >
                    {row.value(rec)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
