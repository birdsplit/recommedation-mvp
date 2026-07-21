import type { Metadata } from "next";
import Link from "next/link";
import {
  computeExperimentSummary,
  loadAdminFunnel,
  loadCohortFeedback,
  loadCohortFunnel,
  loadReactionStats,
  type BranchRow,
  type CohortFeedbackLoadState,
  type CohortFunnelLoadState,
  type ExperimentModeSummary,
  type FunnelRow,
  type ReactionStats,
  type ReactionStatsLoadState,
} from "@/lib/admin-analytics";
import { requireAdmin } from "@/lib/admin-auth";
import { REASON_CHIPS, type ReasonChip } from "@/lib/constants";

export const metadata: Metadata = {
  title: "관리자 대시보드",
};

const numberFormat = new Intl.NumberFormat("ko-KR");

function rateLabel(row: FunnelRow): string {
  if (row.previousRate === null) return "—";
  return `${row.previousRate.toLocaleString("ko-KR", {
    maximumFractionDigits: 1,
  })}%`;
}

function FunnelTable({ rows }: { rows: FunnelRow[] }) {
  return (
    <div className="overflow-hidden rounded-[28px] bg-white shadow-card">
      <div className="border-b border-[#F1E8DE] px-5 py-4">
        <h2 className="text-[16px] font-extrabold">핵심 행동 퍼널</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-faint">
          테스트 링크를 제외한 고유 추천 여정 수예요. 같은 여정의 반복 행동은
          한 번만 셉니다.
        </p>
      </div>

      <div
        className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B382F]"
        role="region"
        aria-label="운영 지표 표"
        tabIndex={0}
      >
        <table className="w-full table-fixed border-collapse text-left">
          <colgroup>
            <col className="w-[55%]" />
            <col className="w-[18%]" />
            <col className="w-[27%]" />
          </colgroup>
          <thead className="bg-peach-50 text-[13px] font-bold text-faint">
            <tr>
              <th scope="col" className="px-4 py-3">
                단계
              </th>
              <th scope="col" className="px-2 py-3 text-right">
                고유 여정
              </th>
              <th scope="col" className="px-3 py-3 text-right">
                전 단계 대비
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.eventType}
                className={index === 0 ? undefined : "border-t border-[#F4ECE4]"}
              >
                <th scope="row" className="px-4 py-3.5 text-[13px] font-bold">
                  <span className="mr-2 text-[13px] text-coral-700">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {row.label}
                </th>
                <td className="px-2 py-3.5 text-right text-[14px] font-extrabold tabular-nums">
                  {numberFormat.format(row.count)}
                </td>
                <td className="px-3 py-3.5 text-right">
                  <span className="text-[13px] font-bold tabular-nums text-sub">
                    {rateLabel(row)}
                  </span>
                  <div className="ml-auto mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-[#F1E8DE]">
                    <div
                      className="h-full rounded-full bg-coral-500"
                      style={{
                        width: `${Math.min(100, row.previousRate ?? 0)}%`,
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BranchTable({ rows }: { rows: BranchRow[] }) {
  return (
    <section className="mt-4 overflow-hidden rounded-[28px] bg-white shadow-card">
      <div className="border-b border-[#F1E8DE] px-5 py-4">
        <h2 className="text-[16px] font-extrabold">결과 이후 분기 행동</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-faint">
          순서가 정해진 퍼널이 아니라, 결과를 본 여정 중 각 행동을 한 비율이에요.
        </p>
      </div>
      <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-5">
        {rows.map((row) => (
          <article key={row.eventType} className="rounded-2xl bg-cream p-4">
            <h3 className="text-[13px] font-bold text-sub">{row.label}</h3>
            <p className="mt-2 text-[22px] font-extrabold tabular-nums">
              {row.resultsRate === null ? "—" : `${row.resultsRate}%`}
            </p>
            <p className="mt-1 text-[13px] font-semibold text-faint">
              고유 여정 {numberFormat.format(row.count)}개
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

/** 0~1 비율을 소수 첫째 자리 %로. null이면 대시. */
function percentLabel(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

/** 1~5 평균을 소수 둘째 자리로. null이면 대시. */
function avgLabel(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

const REACTION_KIND_LABELS: Record<"save" | "exclude" | "hold", string> = {
  save: "저장",
  exclude: "제외",
  hold: "보류",
};

const CONFIRM_BUCKET_LABELS: Record<"must" | "prefer" | "dismissed", string> = {
  must: "필수",
  prefer: "선호",
  dismissed: "아니요",
};

function TargetBadge({ met, label }: { met: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
        met
          ? "bg-[#E4F3E7] text-[#2F7A43]"
          : "bg-[#F3ECE3] text-faint"
      }`}
    >
      {label} · {met ? "달성" : "미달"}
    </span>
  );
}

function SummaryMetric({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-[#F1E8DE] py-2 first:border-t-0">
      <dt className="text-[13px] font-semibold text-sub">{label}</dt>
      <dd className="flex items-center gap-2">
        {badge}
        <span className="text-[15px] font-extrabold tabular-nums">{value}</span>
      </dd>
    </div>
  );
}

function ExperimentSummaryPanel({
  summaries,
}: {
  summaries: ExperimentModeSummary[];
}) {
  return (
    <div className="grid gap-3 p-4 sm:grid-cols-2">
      {summaries.map((summary) => (
        <article key={summary.mode} className="rounded-2xl bg-cream p-4">
          <header className="flex items-baseline justify-between gap-2">
            <h3 className="text-[14px] font-extrabold">{summary.label}</h3>
            <span className="text-[12px] font-bold text-faint">{summary.mode}</span>
          </header>
          <dl className="mt-2">
            <SummaryMetric
              label="여정 수"
              value={numberFormat.format(summary.journeys)}
            />
            <SummaryMetric
              label="완주율 (결과 도달)"
              value={percentLabel(summary.completionRate)}
              badge={
                <TargetBadge
                  met={summary.meetsCompletionTarget}
                  label="완주 30% 목표"
                />
              }
            />
            <SummaryMetric
              label="판매처 이동률"
              value={percentLabel(summary.outboundRate)}
              badge={
                <TargetBadge
                  met={summary.meetsOutboundTarget}
                  label="이동 10% 목표"
                />
              }
            />
            {summary.mode === "loop" && (
              <SummaryMetric
                label="최종확정 수"
                value={numberFormat.format(summary.finalizeCount)}
              />
            )}
            <SummaryMetric
              label="평균 확신도"
              value={avgLabel(summary.avgConfidence)}
            />
            <SummaryMetric
              label="후보 발견율"
              value={percentLabel(summary.foundRate)}
            />
          </dl>
        </article>
      ))}
    </div>
  );
}

function ReactionStatsPanel({
  stats,
  isEmpty,
}: {
  stats: ReactionStats;
  isEmpty: boolean;
}) {
  const confirmTotal =
    stats.confirmBuckets.must +
    stats.confirmBuckets.prefer +
    stats.confirmBuckets.dismissed;

  return (
    <div className="border-t border-[#F1E8DE] p-4">
      <h3 className="text-[14px] font-extrabold">반응 통계 (반응 기반 추천)</h3>
      {isEmpty ? (
        <p className="mt-2 text-[13px] leading-relaxed text-faint">
          아직 반응·기준 확인 데이터가 없어요. 반응 기반 추천 여정이 쌓이면
          여기에 표시돼요.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="rounded-2xl bg-cream p-3">
            <p className="text-[13px] font-semibold text-sub">
              총 반응{" "}
              <span className="text-[15px] font-extrabold tabular-nums">
                {numberFormat.format(stats.totalReactions)}
              </span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["save", "exclude", "hold"] as const).map((kind) => (
                <span
                  key={kind}
                  className="rounded-full bg-white px-3 py-1 text-[12.5px] font-bold text-sub shadow-soft"
                >
                  {REACTION_KIND_LABELS[kind]}{" "}
                  <span className="tabular-nums">
                    {numberFormat.format(stats.byKind[kind])}
                  </span>
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-cream p-3">
            <p className="text-[13px] font-semibold text-sub">상위 이유 칩</p>
            {stats.topChips.length === 0 ? (
              <p className="mt-1 text-[13px] text-faint">기록된 이유 칩이 없어요.</p>
            ) : (
              <ol className="mt-2 space-y-1">
                {stats.topChips.map((item) => (
                  <li
                    key={item.chip}
                    className="flex items-center justify-between gap-2 text-[13px]"
                  >
                    <span className="font-semibold text-sub">
                      {REASON_CHIPS[item.chip as ReasonChip] ?? item.chip}
                    </span>
                    <span className="font-extrabold tabular-nums">
                      {numberFormat.format(item.count)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="rounded-2xl bg-cream p-3">
            <p className="text-[13px] font-semibold text-sub">
              기준 확인 응답 분포{" "}
              <span className="text-[13px] font-bold text-faint">
                (총 {numberFormat.format(confirmTotal)})
              </span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["must", "prefer", "dismissed"] as const).map((bucket) => (
                <span
                  key={bucket}
                  className="rounded-full bg-white px-3 py-1 text-[12.5px] font-bold text-sub shadow-soft"
                >
                  {CONFIRM_BUCKET_LABELS[bucket]}{" "}
                  <span className="tabular-nums">
                    {numberFormat.format(stats.confirmBuckets[bucket])}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExperimentSection({
  cohortFunnel,
  cohortFeedback,
  reactions,
}: {
  cohortFunnel: CohortFunnelLoadState;
  cohortFeedback: CohortFeedbackLoadState;
  reactions: ReactionStatsLoadState;
}) {
  const states = [cohortFunnel, cohortFeedback, reactions];
  const anySetup = states.some((state) => state.status === "setup");
  const anyError = states.some((state) => state.status === "error");
  const allReady =
    cohortFunnel.status === "ready" &&
    cohortFeedback.status === "ready" &&
    reactions.status === "ready";

  return (
    <section className="mt-4 overflow-hidden rounded-[28px] bg-white shadow-card">
      <div className="border-b border-[#F1E8DE] px-5 py-4">
        <h2 className="text-[16px] font-extrabold">실험 현황 (H1·H3)</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-faint">
          일회성 추천(oneshot)과 반응 기반 추천(loop)을 나란히 비교해요. 완주율
          30%·판매처 이동률 10%가 H3 목표예요.
        </p>
      </div>
      {anySetup ? (
        <div className="p-4">
          <SetupState />
        </div>
      ) : anyError ? (
        <div className="p-4">
          <ErrorState />
        </div>
      ) : allReady ? (
        <>
          <ExperimentSummaryPanel
            summaries={computeExperimentSummary(
              cohortFunnel.cohorts,
              cohortFeedback.cohorts
            )}
          />
          <ReactionStatsPanel
            stats={reactions.stats}
            isEmpty={reactions.isEmpty}
          />
        </>
      ) : null}
    </section>
  );
}

function SetupState() {
  return (
    <section className="rounded-[28px] border border-[#F2D7C8] bg-white p-6 shadow-card">
      <p className="text-[28px]" aria-hidden="true">
        🔌
      </p>
      <h2 className="mt-2 text-[17px] font-extrabold">데이터 연결이 필요해요</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-sub">
        <code className="font-bold">.env.local</code>에 Supabase URL과 service
        role 키를 설정한 뒤 서버를 다시 시작해 주세요. 새 프로젝트라면 먼저
        <code className="ml-1 font-bold">supabase/schema.sql</code>을 적용해야 해요.
      </p>
    </section>
  );
}

function ErrorState() {
  return (
    <section className="rounded-[28px] border border-[#F5C8BC] bg-white p-6 shadow-card">
      <p className="text-[28px]" aria-hidden="true">
        ⚠️
      </p>
      <h2 className="mt-2 text-[17px] font-extrabold">
        분석 데이터를 불러오지 못했어요
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-sub">
        잠시 뒤 새로고침해 주세요. 계속되면 Supabase 연결과
        <code className="mx-1 font-bold">events</code>테이블 적용 여부를 확인해
        주세요.
      </p>
    </section>
  );
}

function EmptyState() {
  return (
    <section className="mb-4 rounded-[24px] bg-honey-50 px-5 py-4">
      <h2 className="text-[14px] font-extrabold text-honey-700">
        아직 기록된 이벤트가 없어요
      </h2>
      <p className="mt-1 text-[13px] leading-relaxed text-sub">
        사용자 여정을 한 번 완료하면 아래 퍼널에 행동 수와 단계별 비율이
        표시돼요.
      </p>
    </section>
  );
}

export default async function AdminDashboardPage() {
  await requireAdmin();
  const [funnel, cohortFunnel, cohortFeedback, reactions] = await Promise.all([
    loadAdminFunnel(),
    loadCohortFunnel(),
    loadCohortFeedback(),
    loadReactionStats(),
  ]);
  const canExport = funnel.status === "ready";

  return (
    <main className="min-h-dvh px-5 pb-14 pt-7">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-bold text-coral-700">ADMIN</p>
          <h1 className="mt-1 text-[24px] font-extrabold">검증 대시보드</h1>
          <p className="mt-1 text-[13px] text-sub">
            추천 여정의 이탈 지점을 한눈에 확인해요.
          </p>
        </div>
        <Link
          href="/admin/products"
          className="shrink-0 rounded-full border border-[#EADFD2] bg-white px-3.5 py-2 text-[13px] font-bold shadow-soft"
        >
          상품 관리
        </Link>
      </div>

      <section className="my-5 rounded-[24px] bg-peach-50 p-4">
        <p className="text-[13px] font-bold text-faint">익명 데이터 내보내기</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {canExport ? (
            <>
              <a
                href="/api/admin/export/events"
                download
                className="rounded-full bg-white px-4 py-2.5 text-[13px] font-extrabold text-coral-700 shadow-soft"
              >
                이벤트 CSV
              </a>
              <a
                href="/api/admin/export/feedback"
                download
                className="rounded-full bg-white px-4 py-2.5 text-[13px] font-extrabold text-coral-700 shadow-soft"
              >
                피드백 CSV
              </a>
            </>
          ) : (
            <span
              aria-disabled="true"
              className="rounded-full bg-white/70 px-4 py-2.5 text-[13px] font-bold text-faint"
            >
              데이터 연결 후 CSV를 받을 수 있어요
            </span>
          )}
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-faint">
          연락처 없이 익명 브라우저·journey·run ID 기준으로 내려받아요.
        </p>
      </section>

      {funnel.status === "setup" && <SetupState />}
      {funnel.status === "error" && <ErrorState />}
      {funnel.status === "ready" && (
        <>
          {funnel.isEmpty && <EmptyState />}
          <FunnelTable rows={funnel.rows} />
          <BranchTable rows={funnel.branches} />
          <ExperimentSection
            cohortFunnel={cohortFunnel}
            cohortFeedback={cohortFeedback}
            reactions={reactions}
          />
        </>
      )}
    </main>
  );
}
