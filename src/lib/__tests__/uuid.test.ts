import { describe, expect, it } from "vitest";
import { isUuid } from "@/lib/uuid";

describe("isUuid", () => {
  it("정상 UUID는 허용한다", () => {
    expect(isUuid("00000000-0000-4000-8000-000000000001")).toBe(true);
    expect(isUuid("A8098C1A-F86E-11DA-BD1A-00112444BE1E")).toBe(true);
  });

  it("손상되거나 UUID가 아닌 저장값은 거부한다", () => {
    expect(isUuid("")).toBe(false);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("00000000-0000-4000-8000-000000000001-extra")).toBe(false);
    expect(isUuid(null)).toBe(false);
  });
});
