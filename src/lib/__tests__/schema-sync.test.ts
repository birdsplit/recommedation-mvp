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
  it("현재 스키마는 초기 migration에 후속 공개 출처 제약만 반영한다", () => {
    const initial = normalized(
      "supabase/migrations/20260711000000_initial_schema.sql"
    );
    const current = normalized("supabase/schema.sql");
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
    expect(current).toBe(initial.replace(initialTail, currentTail));
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
});
