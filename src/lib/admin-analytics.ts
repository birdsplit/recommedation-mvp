import "server-only";

import { connection } from "next/server";
import {
  EXPERIMENT_MODES,
  MODE_LABELS,
  type ExperimentMode,
} from "@/lib/constants";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase";

/** 결과 도달 전은 순차 퍼널, 결과 이후는 독립적인 분기 행동으로 계산한다. */
export const FUNNEL_STAGES = [
  { eventType: "visit", label: "서비스 방문" },
  { eventType: "start_click", label: "질문 시작" },
  { eventType: "questions_complete", label: "질문 완료" },
  { eventType: "summary_view", label: "조건 요약 확인" },
  { eventType: "results_view", label: "추천 결과 확인" },
] as const;

export const BRANCH_ACTIONS = [
  { eventType: "product_detail_view", label: "상품 상세 열람" },
  { eventType: "compare_add", label: "상세 비교" },
  { eventType: "cost_check", label: "추가비용 확인" },
  { eventType: "outbound_click", label: "판매처 이동" },
  { eventType: "source_open", label: "정보 출처 열람" },
  { eventType: "feedback_submit", label: "피드백 제출" },
] as const;

export type FunnelEventType = (typeof FUNNEL_STAGES)[number]["eventType"];
export type BranchEventType = (typeof BRANCH_ACTIONS)[number]["eventType"];
type MetricEventType = FunnelEventType | BranchEventType;

export interface FunnelRow {
  eventType: FunnelEventType;
  label: string;
  count: number;
  /** 바로 전 단계 대비 비율(%). 첫 단계 또는 전 단계 0건이면 null. */
  previousRate: number | null;
}

export interface BranchRow {
  eventType: BranchEventType;
  label: string;
  count: number;
  /** 결과를 본 고유 journey 중 이 행동을 한 비율. */
  resultsRate: number | null;
}

export type FunnelLoadState =
  | { status: "setup" }
  | { status: "error" }
  | {
      status: "ready";
      rows: FunnelRow[];
      branches: BranchRow[];
      isEmpty: boolean;
    };

type FunnelCounts = Partial<Record<MetricEventType, number>>;

function safeCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function previousStageRate(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round((current / previous) * 1_000) / 10;
}

/** DB 결과를 표시용 행으로 바꾸는 순수 함수. */
export function buildFunnelRows(counts: FunnelCounts): FunnelRow[] {
  return FUNNEL_STAGES.map((stage, index) => {
    const count = safeCount(counts[stage.eventType]);
    const previous =
      index === 0
        ? null
        : safeCount(counts[FUNNEL_STAGES[index - 1].eventType]);

    return {
      ...stage,
      count,
      previousRate:
        previous === null ? null : previousStageRate(count, previous),
    };
  });
}

export function buildBranchRows(counts: FunnelCounts): BranchRow[] {
  const resultsCount = safeCount(counts.results_view);
  return BRANCH_ACTIONS.map((action) => {
    const count = safeCount(counts[action.eventType]);
    return {
      ...action,
      count,
      resultsRate:
        resultsCount === 0
          ? null
          : Math.round((count / resultsCount) * 1_000) / 10,
    };
  });
}

/** SQL 함수가 테스트 데이터를 제외하고 event_type별 고유 journey를 집계한다. */
export async function loadAdminFunnel(): Promise<FunnelLoadState> {
  await connection();

  if (!isSupabaseConfigured()) return { status: "setup" };

  try {
    const { data, error } = await supabaseAdmin().rpc(
      "admin_journey_event_counts"
    );
    if (error) throw error;
    const counts: FunnelCounts = {};
    for (const row of (data ?? []) as Array<{
      event_type: string;
      journey_count: number | string;
    }>) {
      const known = [...FUNNEL_STAGES, ...BRANCH_ACTIONS].some(
        (metric) => metric.eventType === row.event_type
      );
      if (known) {
        counts[row.event_type as MetricEventType] = Number(row.journey_count);
      }
    }

    const rows = buildFunnelRows(counts);
    const branches = buildBranchRows(counts);
    return {
      status: "ready",
      rows,
      branches,
      isEmpty:
        rows.every((row) => row.count === 0) &&
        branches.every((row) => row.count === 0),
    };
  } catch (error) {
    console.error("관리자 퍼널 조회 실패:", error);
    return { status: "error" };
  }
}

// =============================================================
// A/B 실험(arm A oneshot vs arm B loop) 코호트별 집계
// =============================================================

/** 원시 event_type → 고유 여정 수. loop 전용 이벤트(shortlist_finalize 등)도 담는다. */
type RawCohortCounts = Record<string, number>;

export interface CohortFunnel {
  /** "oneshot" | "loop" | "" (빈 문자열 = 미배정 버킷) */
  cohort: ExperimentMode | "";
  label: string;
  /** 실험 배정 팔이면 true, 미배정 버킷이면 false(화면에서 흐리게 표시). */
  isAssigned: boolean;
  /** buildFunnelRows/buildBranchRows가 모르는 loop 이벤트까지 포함한 원시 집계. */
  counts: RawCohortCounts;
  rows: FunnelRow[];
  branches: BranchRow[];
  isEmpty: boolean;
}

export type CohortFunnelLoadState =
  | { status: "setup" }
  | { status: "error" }
  | { status: "ready"; cohorts: CohortFunnel[]; isEmpty: boolean };

/** oneshot/loop만 개별 팔로 두고, 그 밖의 값(빈 문자열·미지 코호트)은 미배정으로 모은다. */
function bucketCohort(raw: string | null | undefined): ExperimentMode | "" {
  return raw === "oneshot" || raw === "loop" ? raw : "";
}

function buildCohortFunnel(
  cohort: ExperimentMode | "",
  label: string,
  isAssigned: boolean,
  counts: RawCohortCounts
): CohortFunnel {
  const rows = buildFunnelRows(counts);
  const branches = buildBranchRows(counts);
  return {
    cohort,
    label,
    isAssigned,
    counts,
    rows,
    branches,
    isEmpty:
      rows.every((row) => row.count === 0) &&
      branches.every((row) => row.count === 0),
  };
}

/** 코호트별 event_type 고유 여정 수(admin_cohort_event_counts)를 팔별 퍼널로 나눈다. */
export async function loadCohortFunnel(): Promise<CohortFunnelLoadState> {
  await connection();

  if (!isSupabaseConfigured()) return { status: "setup" };

  try {
    const { data, error } = await supabaseAdmin().rpc(
      "admin_cohort_event_counts"
    );
    if (error) throw error;

    const buckets = new Map<ExperimentMode | "", RawCohortCounts>();
    for (const row of (data ?? []) as Array<{
      cohort: string | null;
      event_type: string;
      journey_count: number | string;
    }>) {
      const bucket = bucketCohort(row.cohort);
      const counts = buckets.get(bucket) ?? {};
      counts[row.event_type] =
        (counts[row.event_type] ?? 0) + safeCount(Number(row.journey_count));
      buckets.set(bucket, counts);
    }

    const cohorts: CohortFunnel[] = EXPERIMENT_MODES.map((mode) =>
      buildCohortFunnel(mode, MODE_LABELS[mode], true, buckets.get(mode) ?? {})
    );
    const unassigned = buckets.get("");
    if (unassigned && Object.values(unassigned).some((count) => count > 0)) {
      cohorts.push(buildCohortFunnel("", "(미배정)", false, unassigned));
    }

    return {
      status: "ready",
      cohorts,
      isEmpty: cohorts.every((cohort) => cohort.isEmpty),
    };
  } catch (error) {
    console.error("코호트 퍼널 조회 실패:", error);
    return { status: "error" };
  }
}

export interface CohortFeedback {
  mode: ExperimentMode;
  label: string;
  feedbackCount: number;
  /** 결정 확신도 평균(1~5). 응답이 없으면 null. */
  avgConfidence: number | null;
  avgTimeSaved: number | null;
  avgConditions: number | null;
  avgReasons: number | null;
  /** 고려 상품 발견 비율(0~1). */
  foundRate: number | null;
  /** 재사용 의향 비율(0~1). */
  reuseRate: number | null;
}

export type CohortFeedbackLoadState =
  | { status: "setup" }
  | { status: "error" }
  | { status: "ready"; cohorts: CohortFeedback[]; isEmpty: boolean };

interface RawCohortFeedbackRow {
  mode?: unknown;
  feedback_count?: unknown;
  avg_confidence?: unknown;
  avg_time_saved?: unknown;
  avg_conditions?: unknown;
  avg_reasons?: unknown;
  found_rate?: unknown;
  reuse_rate?: unknown;
}

/** Postgres numeric은 문자열로 올 수 있으니 유한한 수만 통과시키고 나머지는 null. */
function toNumeric(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** 팔별 피드백 평균(admin_cohort_feedback). run이 없는 피드백은 SQL 조인에서 제외된다. */
export async function loadCohortFeedback(): Promise<CohortFeedbackLoadState> {
  await connection();

  if (!isSupabaseConfigured()) return { status: "setup" };

  try {
    const { data, error } = await supabaseAdmin().rpc("admin_cohort_feedback");
    if (error) throw error;

    const byMode = new Map<string, RawCohortFeedbackRow>();
    for (const row of (data ?? []) as RawCohortFeedbackRow[]) {
      if (typeof row.mode === "string") byMode.set(row.mode, row);
    }

    // 팔별로 항상 두 칸을 채운다 — 응답이 없는 팔도 0/null로 표시해 비교가 끊기지 않게.
    const cohorts: CohortFeedback[] = EXPERIMENT_MODES.map((mode) => {
      const row = byMode.get(mode);
      return {
        mode,
        label: MODE_LABELS[mode],
        feedbackCount: row ? safeCount(Number(row.feedback_count)) : 0,
        avgConfidence: toNumeric(row?.avg_confidence),
        avgTimeSaved: toNumeric(row?.avg_time_saved),
        avgConditions: toNumeric(row?.avg_conditions),
        avgReasons: toNumeric(row?.avg_reasons),
        foundRate: toNumeric(row?.found_rate),
        reuseRate: toNumeric(row?.reuse_rate),
      };
    });

    return {
      status: "ready",
      cohorts,
      isEmpty: cohorts.every((cohort) => cohort.feedbackCount === 0),
    };
  } catch (error) {
    console.error("코호트 피드백 조회 실패:", error);
    return { status: "error" };
  }
}

// ---------- H1·H3 요약 (순수 함수) ----------

export interface ExperimentModeSummary {
  mode: ExperimentMode;
  label: string;
  /** visit 고유 여정 수. */
  journeys: number;
  /** 완주율 = results_view / visit (0~1). visit 0이면 null. */
  completionRate: number | null;
  /** 판매처 이동률 = outbound_click / results_view (0~1). results_view 0이면 null. */
  outboundRate: number | null;
  /** 최종확정(shortlist_finalize) 고유 여정 수. loop에서만 발생. */
  finalizeCount: number;
  avgConfidence: number | null;
  foundRate: number | null;
  /** H3: 완주율 ≥ 30% 달성 여부. */
  meetsCompletionTarget: boolean;
  /** H3: 판매처 이동률 ≥ 10% 달성 여부. */
  meetsOutboundTarget: boolean;
}

/** H3 목표선 — 화면 배지와 계산이 같은 값을 쓰도록 한곳에서 관리한다. */
export const H3_COMPLETION_TARGET = 0.3;
export const H3_OUTBOUND_TARGET = 0.1;

/**
 * 팔별 퍼널·피드백을 H1(확신도·발견율)·H3(완주율·이동률) 요약으로 합친다.
 * 순수 함수 — 0 나눗셈은 null로, 목표 달성은 명시적 임계값 비교로 판정한다.
 */
export function computeExperimentSummary(
  cohortFunnels: readonly CohortFunnel[],
  cohortFeedback: readonly CohortFeedback[]
): ExperimentModeSummary[] {
  return EXPERIMENT_MODES.map((mode) => {
    const funnel = cohortFunnels.find((cohort) => cohort.cohort === mode);
    const feedback = cohortFeedback.find((cohort) => cohort.mode === mode);

    const journeys = safeCount(funnel?.counts.visit);
    const resultsViews = safeCount(funnel?.counts.results_view);
    const outbound = safeCount(funnel?.counts.outbound_click);
    const finalizeCount = safeCount(funnel?.counts.shortlist_finalize);

    const completionRate = journeys > 0 ? resultsViews / journeys : null;
    const outboundRate = resultsViews > 0 ? outbound / resultsViews : null;

    return {
      mode,
      label: MODE_LABELS[mode],
      journeys,
      completionRate,
      outboundRate,
      finalizeCount,
      avgConfidence: feedback?.avgConfidence ?? null,
      foundRate: feedback?.foundRate ?? null,
      meetsCompletionTarget:
        completionRate !== null && completionRate >= H3_COMPLETION_TARGET,
      meetsOutboundTarget:
        outboundRate !== null && outboundRate >= H3_OUTBOUND_TARGET,
    };
  });
}

// ---------- 반응 루프(arm B) 통계 ----------

const REACTION_PAGE_SIZE = 1_000;
const REACTION_MAX_PAGES = 10;
const REACTION_KINDS = ["save", "exclude", "hold"] as const;
const CONFIRM_BUCKETS = ["must", "prefer", "dismissed"] as const;

export type ReactionKind = (typeof REACTION_KINDS)[number];
export type ConfirmBucket = (typeof CONFIRM_BUCKETS)[number];

export interface ReactionStats {
  totalReactions: number;
  byKind: Record<ReactionKind, number>;
  topChips: { chip: string; count: number }[];
  confirmBuckets: Record<ConfirmBucket, number>;
}

export type ReactionStatsLoadState =
  | { status: "setup" }
  | { status: "error" }
  | { status: "ready"; stats: ReactionStats; isEmpty: boolean };

function asPayloadObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * 원시 이벤트 행을 반응 통계로 접는다 — 순수 함수.
 * payload가 객체가 아니거나 kind/bucket이 미지 값이면 조용히 건너뛴다(방어적).
 */
export function aggregateReactionStats(
  reactionRows: readonly ExportRow[],
  confirmRows: readonly ExportRow[]
): ReactionStats {
  const byKind = Object.fromEntries(
    REACTION_KINDS.map((kind) => [kind, 0])
  ) as Record<ReactionKind, number>;
  const chipCounts = new Map<string, number>();
  let totalReactions = 0;

  for (const row of reactionRows) {
    const payload = asPayloadObject(row.payload);
    if (!payload) continue;
    totalReactions += 1;
    const kind = payload.kind;
    if (kind === "save" || kind === "exclude" || kind === "hold") {
      byKind[kind] += 1;
    }
    const chips = payload.chips;
    if (Array.isArray(chips)) {
      for (const chip of chips) {
        if (typeof chip === "string" && chip.trim() !== "") {
          chipCounts.set(chip, (chipCounts.get(chip) ?? 0) + 1);
        }
      }
    }
  }

  const topChips = [...chipCounts.entries()]
    .map(([chip, count]) => ({ chip, count }))
    .sort((a, b) => b.count - a.count || a.chip.localeCompare(b.chip))
    .slice(0, 10);

  const confirmBuckets = Object.fromEntries(
    CONFIRM_BUCKETS.map((bucket) => [bucket, 0])
  ) as Record<ConfirmBucket, number>;
  for (const row of confirmRows) {
    const payload = asPayloadObject(row.payload);
    if (!payload) continue;
    const bucket = payload.bucket;
    if (bucket === "must" || bucket === "prefer" || bucket === "dismissed") {
      confirmBuckets[bucket] += 1;
    }
  }

  return { totalReactions, byKind, topChips, confirmBuckets };
}

/** loadExportRows와 같은 페이징(1,000행 × 최대 10페이지)으로 특정 이벤트를 모은다. */
async function pageReactionEvents(
  db: ReturnType<typeof supabaseAdmin>,
  eventType: string
): Promise<ExportRow[]> {
  const rows: ExportRow[] = [];
  for (let page = 0; page < REACTION_MAX_PAGES; page += 1) {
    const from = page * REACTION_PAGE_SIZE;
    const { data, error } = await db
      .from("events")
      .select("payload")
      .eq("event_type", eventType)
      .eq("is_test", false)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + REACTION_PAGE_SIZE - 1);
    if (error) throw new Error(`${eventType} 조회 실패: ${error.message}`);
    const batch = (data ?? []) as unknown as ExportRow[];
    rows.push(...batch);
    if (batch.length < REACTION_PAGE_SIZE) break;
  }
  return rows;
}

/** 반응(candidate_reaction)과 기준 확인(criteria_confirm) 통계를 함께 반환한다. */
export async function loadReactionStats(): Promise<ReactionStatsLoadState> {
  await connection();

  if (!isSupabaseConfigured()) return { status: "setup" };

  try {
    const db = supabaseAdmin();
    const reactionRows = await pageReactionEvents(db, "candidate_reaction");
    const confirmRows = await pageReactionEvents(db, "criteria_confirm");
    const stats = aggregateReactionStats(reactionRows, confirmRows);
    const isEmpty =
      stats.totalReactions === 0 &&
      CONFIRM_BUCKETS.every((bucket) => stats.confirmBuckets[bucket] === 0);
    return { status: "ready", stats, isEmpty };
  } catch (error) {
    console.error("반응 통계 조회 실패:", error);
    return { status: "error" };
  }
}

export const EXPORT_KINDS = ["events", "feedback"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export function isExportKind(value: string): value is ExportKind {
  return (EXPORT_KINDS as readonly string[]).includes(value);
}

type ExportRow = Record<string, unknown>;
type CsvValue = string | number | bigint | boolean | null | undefined | object;

interface ExportColumn {
  header: string;
  value: (row: ExportRow) => CsvValue;
}

interface ExportDefinition {
  select: string;
  asciiName: string;
  koreanName: string;
  columns: readonly ExportColumn[];
}

function koreanBoolean(value: unknown): string {
  if (value === true) return "예";
  if (value === false) return "아니오";
  return "";
}

function jsonValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

const EXPORT_DEFINITIONS: Record<ExportKind, ExportDefinition> = {
  events: {
    select:
      "id,session_id,journey_id,run_id,event_version,cohort,is_test,event_type,payload,created_at",
    asciiName: "modoo-events",
    koreanName: "모두의침대-사용자이벤트",
    columns: [
      { header: "이벤트 ID", value: (row) => row.id as CsvValue },
      { header: "익명 세션 ID", value: (row) => row.session_id as CsvValue },
      { header: "여정 ID", value: (row) => row.journey_id as CsvValue },
      { header: "추천 실행 ID", value: (row) => row.run_id as CsvValue },
      { header: "이벤트 버전", value: (row) => row.event_version as CsvValue },
      { header: "코호트", value: (row) => row.cohort as CsvValue },
      { header: "테스트", value: (row) => koreanBoolean(row.is_test) },
      { header: "이벤트 유형", value: (row) => row.event_type as CsvValue },
      {
        header: "이벤트 상세(JSON)",
        value: (row) => jsonValue(row.payload),
      },
      { header: "기록 시각", value: (row) => row.created_at as CsvValue },
    ],
  },
  feedback: {
    select:
      "id,session_id,journey_id,run_id,q_time_saved,q_conditions_reflected,q_reasons_helpful,q_decision_confidence,q_found_candidate,q_would_reuse,q_worst_question,chosen_product_id,post_purchase_optin,created_at",
    asciiName: "modoo-feedback",
    koreanName: "모두의침대-피드백",
    columns: [
      { header: "피드백 ID", value: (row) => row.id as CsvValue },
      { header: "익명 세션 ID", value: (row) => row.session_id as CsvValue },
      { header: "여정 ID", value: (row) => row.journey_id as CsvValue },
      { header: "추천 실행 ID", value: (row) => row.run_id as CsvValue },
      {
        header: "시간 단축 (1~5)",
        value: (row) => row.q_time_saved as CsvValue,
      },
      {
        header: "조건 반영 (1~5)",
        value: (row) => row.q_conditions_reflected as CsvValue,
      },
      {
        header: "이유 도움 (1~5)",
        value: (row) => row.q_reasons_helpful as CsvValue,
      },
      {
        header: "결정 확신도 (1~5)",
        value: (row) => row.q_decision_confidence as CsvValue,
      },
      {
        header: "고려 상품 발견",
        value: (row) => koreanBoolean(row.q_found_candidate),
      },
      {
        header: "다시 사용할 의향",
        value: (row) => koreanBoolean(row.q_would_reuse),
      },
      {
        header: "가장 피곤한 질문",
        value: (row) => row.q_worst_question as CsvValue,
      },
      {
        header: "선택 상품 ID",
        value: (row) => row.chosen_product_id as CsvValue,
      },
      {
        header: "구매 후 확인 동의",
        value: (row) => koreanBoolean(row.post_purchase_optin),
      },
      { header: "제출 시각", value: (row) => row.created_at as CsvValue },
    ],
  },
};

function csvText(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "bigint" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "object") return jsonValue(value);
  return value;
}

/**
 * RFC 4180 방식으로 셀을 수기 escape한다.
 * 문자열이 수식 시작 문자로 시작하면 작은따옴표를 붙여 CSV injection을 막는다.
 */
export function escapeCsvCell(value: CsvValue): string {
  let text = csvText(value);
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

/** UTF-8 BOM + CRLF를 사용하는 엑셀 호환 CSV. */
export function createExportCsv(
  kind: ExportKind,
  rows: readonly ExportRow[]
): string {
  const columns = EXPORT_DEFINITIONS[kind].columns;
  const lines = [
    columns.map((column) => escapeCsvCell(column.header)).join(","),
    ...rows.map((row) =>
      columns.map((column) => escapeCsvCell(column.value(row))).join(",")
    ),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

const EXPORT_PAGE_SIZE = 1_000;

export class AdminDataSetupError extends Error {
  constructor() {
    super("Supabase 관리자 데이터 연결이 설정되지 않았습니다.");
    this.name = "AdminDataSetupError";
  }
}

/** Supabase 기본 1,000행 제한을 넘겨도 전 행을 내보낸다. */
export async function loadExportRows(kind: ExportKind): Promise<ExportRow[]> {
  if (!isSupabaseConfigured()) throw new AdminDataSetupError();

  const definition = EXPORT_DEFINITIONS[kind];
  const db = supabaseAdmin();
  const rows: ExportRow[] = [];

  for (let from = 0; ; from += EXPORT_PAGE_SIZE) {
    const { data, error } = await db
      .from(kind)
      .select(definition.select)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + EXPORT_PAGE_SIZE - 1);

    if (error) throw new Error(`${kind} CSV 조회 실패: ${error.message}`);

    const page = (data ?? []) as unknown as ExportRow[];
    rows.push(...page);
    if (page.length < EXPORT_PAGE_SIZE) break;
  }

  return rows;
}

function exportDate(now: Date): string {
  return now.toISOString().slice(0, 10).replaceAll("-", "");
}

/** ASCII fallback과 UTF-8 한글 파일명을 함께 제공한다. */
export function exportContentDisposition(
  kind: ExportKind,
  now = new Date()
): string {
  const definition = EXPORT_DEFINITIONS[kind];
  const date = exportDate(now);
  const asciiFilename = `${definition.asciiName}-${date}.csv`;
  const koreanFilename = `${definition.koreanName}-${date}.csv`;

  return `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(koreanFilename)}`;
}
