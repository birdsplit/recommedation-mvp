import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export interface StudyTokenPayload {
  exp: number;
  cohort: string;
}

function signature(value: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(value).digest();
}

/** 내부 QA 링크 토큰을 서버 비밀키로 검증한다. */
export function verifyStudyToken(token: string): StudyTokenPayload | null {
  const secret = process.env.STUDY_TOKEN_SECRET;
  if (!secret || secret.length < 16) return null;
  const [encoded, supplied, extra] = token.split(".");
  if (!encoded || !supplied || extra) return null;

  try {
    const expected = signature(encoded, secret);
    const received = Buffer.from(supplied, "base64url");
    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      return null;
    }

    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as Partial<StudyTokenPayload>;
    if (
      typeof parsed.exp !== "number" ||
      parsed.exp * 1_000 <= Date.now() ||
      typeof parsed.cohort !== "string" ||
      parsed.cohort.length < 1 ||
      parsed.cohort.length > 80
    ) {
      return null;
    }
    return { exp: parsed.exp, cohort: parsed.cohort };
  } catch {
    return null;
  }
}
