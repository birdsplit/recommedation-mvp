import "server-only";

export type DataMode = "demo" | "live";

/** Only the exact value `live` enables database-backed catalog data. */
export function getDataMode(
  env?: { DATA_MODE?: string }
): DataMode {
  const value = env ? env.DATA_MODE : process.env["DATA_MODE"];
  return value?.trim().toLowerCase() === "live" ? "live" : "demo";
}

export function isDemoDataMode(): boolean {
  return getDataMode() === "demo";
}

export function isLiveDataMode(): boolean {
  return getDataMode() === "live";
}

/** Short compatibility alias used by server UI and redirect guards. */
export const isDemoMode = isDemoDataMode;

export class LiveDataConfigurationError extends Error {
  constructor() {
    super(
      "DATA_MODE=live requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
    this.name = "LiveDataConfigurationError";
  }
}

export function assertLiveDataConfiguration(
  supabaseConfigured: boolean
): void {
  if (isLiveDataMode() && !supabaseConfigured) {
    throw new LiveDataConfigurationError();
  }
}
