export type JsonObject = Record<string, unknown>;

export type JsonBodyResult =
  | { ok: true; value: JsonObject }
  | { ok: false; status: 400 | 413 | 415 };

/** 공개 POST API에서 JSON 형식과 전체 요청 크기를 함께 제한한다. */
export async function readJsonObject(
  req: Request,
  maxBytes: number
): Promise<JsonBodyResult> {
  const contentType = req.headers.get("content-type")?.split(";", 1)[0].trim();
  if (contentType !== "application/json") {
    return { ok: false, status: 415 };
  }

  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { ok: false, status: 413 };
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return { ok: false, status: 400 };
  }
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    return { ok: false, status: 413 };
  }

  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, status: 400 };
    }
    return { ok: true, value: value as JsonObject };
  } catch {
    return { ok: false, status: 400 };
  }
}
