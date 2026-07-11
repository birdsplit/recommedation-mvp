import "server-only";

import { connection } from "next/server";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase";

/**
 * 관리자 대시보드에서 보는 핵심 검증 퍼널.
 * question_answer는 한 세션에서 세 번 발생하므로 완료 이벤트만 퍼널에 포함한다.
 */
export const FUNNEL_STAGES = [
  { eventType: "visit", label: "서비스 방문" },
  { eventType: "start_click", label: "질문 시작" },
  { eventType: "questions_complete", label: "질문 완료" },
  { eventType: "summary_view", label: "조건 요약 확인" },
  { eventType: "results_view", label: "추천 결과 확인" },
  { eventType: "product_detail_view", label: "상품 상세 열람" },
  { eventType: "compare_add", label: "비교함 추가" },
  { eventType: "cost_check", label: "총비용 확인" },
  { eventType: "outbound_click", label: "판매처 이동" },
  { eventType: "feedback_submit", label: "피드백 제출" },
] as const;

export type FunnelEventType = (typeof FUNNEL_STAGES)[number]["eventType"];

export interface FunnelRow {
  eventType: FunnelEventType;
  label: string;
  count: number;
  /** 바로 전 단계 대비 비율(%). 첫 단계 또는 전 단계 0건이면 null. */
  previousRate: number | null;
}

export type FunnelLoadState =
  | { status: "setup" }
  | { status: "error" }
  | { status: "ready"; rows: FunnelRow[]; isEmpty: boolean };

type FunnelCounts = Partial<Record<FunnelEventType, number>>;

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

/**
 * 이벤트 행 전체를 내려받지 않고 단계별 exact count만 조회한다.
 * 반복 열람/클릭도 검증 행동이므로 이 화면의 수치는 고유 사용자 수가 아닌 이벤트 수다.
 */
export async function loadAdminFunnel(): Promise<FunnelLoadState> {
  await connection();

  if (!isSupabaseConfigured()) return { status: "setup" };

  try {
    const db = supabaseAdmin();
    const results = await Promise.all(
      FUNNEL_STAGES.map((stage) => {
        const query = db
          .from("events")
          .select("id", { count: "exact", head: true });

        // 같은 타입으로 기록되는 "이미 후보가 있어요" 검증 링크는 질문 시작이 아니다.
        if (stage.eventType === "start_click") {
          return query
            .contains("payload", { entry: "questions" })
            .eq("event_type", stage.eventType);
        }

        return query.eq("event_type", stage.eventType);
      })
    );

    const counts: FunnelCounts = {};
    for (const [index, result] of results.entries()) {
      if (result.error) throw result.error;
      counts[FUNNEL_STAGES[index].eventType] = result.count ?? 0;
    }

    const rows = buildFunnelRows(counts);
    return {
      status: "ready",
      rows,
      isEmpty: rows.every((row) => row.count === 0),
    };
  } catch (error) {
    console.error("관리자 퍼널 조회 실패:", error);
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
    select: "id,session_id,event_type,payload,created_at",
    asciiName: "modoo-events",
    koreanName: "모두의침대-사용자이벤트",
    columns: [
      { header: "이벤트 ID", value: (row) => row.id as CsvValue },
      { header: "익명 세션 ID", value: (row) => row.session_id as CsvValue },
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
      "id,session_id,q_time_saved,q_conditions_reflected,q_reasons_helpful,q_found_candidate,q_would_reuse,q_worst_question,chosen_product_id,post_purchase_optin,created_at",
    asciiName: "modoo-feedback",
    koreanName: "모두의침대-피드백",
    columns: [
      { header: "피드백 ID", value: (row) => row.id as CsvValue },
      { header: "익명 세션 ID", value: (row) => row.session_id as CsvValue },
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
