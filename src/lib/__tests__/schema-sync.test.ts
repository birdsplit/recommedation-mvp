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
  it("SQL Editor용 스키마와 초기 migration이 동일하다", () => {
    expect(normalized("supabase/migrations/20260711000000_initial_schema.sql"))
      .toBe(normalized("supabase/schema.sql"));
  });
});
