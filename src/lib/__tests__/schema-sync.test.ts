import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function normalized(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8")
    .replace(/\r\n/g, "\n")
    .trim();
}

describe("Supabase schema source", () => {
  it("현재 스키마는 초기 스키마와 모든 후속 migration을 순서대로 반영한다", () => {
    const initial = normalized(
      "supabase/migrations/20260711000000_initial_schema.sql"
    );
    const current = normalized("supabase/schema.sql");
    const catalogRuntime = normalized(
      "supabase/migrations/20260712010000_catalog_runtime.sql"
    );
    const recommendationRuns = normalized(
      "supabase/migrations/20260712020000_recommendation_runs.sql"
    );
    const catalogEvidenceReview = normalized(
      "supabase/migrations/20260712030000_catalog_evidence_review.sql"
    );
    const reactionLoopEvents = normalized(
      "supabase/migrations/20260720010000_reaction_loop_events.sql"
    );
    const recommendationRunMode = normalized(
      "supabase/migrations/20260720020000_recommendation_run_mode.sql"
    );
    const feedbackDecisionConfidence = normalized(
      "supabase/migrations/20260720030000_feedback_decision_confidence.sql"
    );
    const initialTail =
      "  check (installation_service not in ('paid','included') or assembly_service_available)\n);";
    const currentTail = `  check (installation_service not in ('paid','included') or assembly_service_available),
  constraint products_public_source_note_check
    check (
      status <> 'public'
      or (source_note is not null and source_note ~ '[^[:space:]]')
    )
);`;

    expect(initial).not.toContain("products_public_source_note_check");
    expect(initial).toContain(initialTail);
    expect(current).toBe(
      `${initial.replace(initialTail, currentTail)}\n\n${catalogRuntime}\n\n${recommendationRuns}\n\n${catalogEvidenceReview}\n\n${reactionLoopEvents}\n\n${recommendationRunMode}\n\n${feedbackDecisionConfidence}`
    );
  });

  it("반응 루프 migration이 이벤트·실행 모드·피드백 확장을 현재 스키마에 설치한다", () => {
    const current = normalized("supabase/schema.sql");
    // 반응 루프 이벤트 6종
    expect(current).toContain("browse_view");
    expect(current).toContain("candidate_reaction");
    expect(current).toContain("shortlist_finalize");
    // 코호트 퍼널·피드백 집계 함수
    expect(current).toContain("admin_cohort_event_counts");
    expect(current).toContain("admin_cohort_feedback");
    // start_click 귀속을 questions/browse로 넓혔는지
    expect(current).toContain("events.payload ->> 'entry' in ('questions','browse')");
    // 추천 실행 모드 컬럼과 제약
    expect(current).toContain("mode in ('oneshot','loop')");
    expect(current).toContain("recommendation_runs_mode_idx");
    // 결정 확신도 피드백 항목
    expect(current).toContain("q_decision_confidence");
  });

  it("후속 migration이 현재 스키마의 공개 출처 제약을 설치한다", () => {
    const migration = normalized(
      "supabase/migrations/20260711010000_require_public_product_source.sql"
    );
    const compact = (sql: string) => sql.replace(/\s+/g, " ");
    const publicSourceCheck = compact(`check (
      status <> 'public'
      or (source_note is not null and source_note ~ '[^[:space:]]')
    )`);

    expect(compact(normalized("supabase/schema.sql"))).toContain(
      publicSourceCheck
    );
    expect(compact(migration)).toContain(
      `add constraint products_public_source_note_check ${publicSourceCheck}`
    );
  });

  it("카탈로그 migration이 실상품 증거와 불변 릴리스 스냅샷을 설치한다", () => {
    const migration = normalized(
      "supabase/migrations/20260712010000_catalog_runtime.sql"
    );

    expect(migration).toContain("create table product_evidence");
    expect(migration).toContain("create table catalog_releases");
    expect(migration).toContain("create table catalog_release_products");
    expect(migration).toContain("create or replace function publish_catalog_release");
    expect(migration).toContain("products_public_catalog_ready_check");
  });
});
