import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  assertLiveDataConfiguration,
  getDataMode,
  LiveDataConfigurationError,
} from "@/lib/data-mode";

describe("DATA_MODE", () => {
  it("only an explicit live value enables live data", () => {
    expect(getDataMode({ DATA_MODE: "live" })).toBe("live");
    expect(getDataMode({ DATA_MODE: " LIVE " })).toBe("live");
  });

  it("defaults missing and unexpected values safely to demo", () => {
    expect(getDataMode({ DATA_MODE: undefined })).toBe("demo");
    expect(getDataMode({ DATA_MODE: "" })).toBe("demo");
    expect(getDataMode({ DATA_MODE: "production" })).toBe("demo");
  });

  it("fails closed when live mode has no Supabase credentials", () => {
    const previous = process.env.DATA_MODE;
    process.env.DATA_MODE = "live";
    try {
      expect(() => assertLiveDataConfiguration(false)).toThrow(
        LiveDataConfigurationError
      );
      expect(() => assertLiveDataConfiguration(true)).not.toThrow();
    } finally {
      if (previous === undefined) delete process.env.DATA_MODE;
      else process.env.DATA_MODE = previous;
    }
  });
});
