import "server-only";

import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const ADMIN_COOKIE_NAME = "modoo_admin_session";
export const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 8;

const TOKEN_VERSION = "v1";
const SIGNATURE_CONTEXT = "modoo-admin-session";
const PASSWORD_CONTEXT = "modoo-admin-password";

type AdminAuthEnvironment = {
  [key: string]: string | undefined;
  ADMIN_PASSWORD?: string;
  ADMIN_COOKIE_SECRET?: string;
};

export type AdminSessionCookie = {
  value: string;
  expires: Date;
  maxAge: number;
};

export type AdminCookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  expires: Date;
  maxAge: number;
};

function getCookieSecret(env: AdminAuthEnvironment = process.env): string | null {
  const secret = env.ADMIN_COOKIE_SECRET;
  return typeof secret === "string" && secret.length > 0 ? secret : null;
}

function digestPassword(value: string, secret: string): Buffer {
  return createHmac("sha256", secret)
    .update(PASSWORD_CONTEXT)
    .update("\0")
    .update(value)
    .digest();
}

function signPayload(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret)
    .update(SIGNATURE_CONTEXT)
    .update("\0")
    .update(payload)
    .digest();
}

/** 관리자 인증 환경변수가 모두 준비되었는지 확인한다. */
export function isAdminAuthConfigured(
  env: AdminAuthEnvironment = process.env
): boolean {
  return Boolean(
    typeof env.ADMIN_PASSWORD === "string" &&
      env.ADMIN_PASSWORD.length > 0 &&
      getCookieSecret(env)
  );
}

/**
 * 입력값과 환경변수 비밀번호를 같은 길이의 HMAC 다이제스트로 만든 뒤
 * timingSafeEqual로 비교한다. 환경변수 누락 시에도 성공하지 않는다.
 */
export function verifyAdminPassword(
  candidate: string,
  env: AdminAuthEnvironment = process.env
): boolean {
  const configured = isAdminAuthConfigured(env);
  const expected = env.ADMIN_PASSWORD ?? "";
  const secret = getCookieSecret(env) ?? "unconfigured-admin-cookie-secret";
  const candidateDigest = digestPassword(candidate, secret);
  const expectedDigest = digestPassword(expected, secret);

  return timingSafeEqual(candidateDigest, expectedDigest) && configured;
}

/** HMAC 서명과 만료시각을 포함한 관리자 세션 쿠키 값을 만든다. */
export function createAdminSessionCookie(
  now: Date = new Date(),
  env: AdminAuthEnvironment = process.env
): AdminSessionCookie {
  const secret = getCookieSecret(env);
  if (!secret) {
    throw new Error("ADMIN_COOKIE_SECRET is not configured");
  }

  const maxAge = ADMIN_SESSION_TTL_SECONDS;
  const expiresAtSeconds = Math.floor(now.getTime() / 1000) + maxAge;
  const nonce = randomBytes(18).toString("base64url");
  const payload = `${TOKEN_VERSION}.${expiresAtSeconds}.${nonce}`;
  const signature = signPayload(payload, secret).toString("base64url");

  return {
    value: `${payload}.${signature}`,
    expires: new Date(expiresAtSeconds * 1000),
    maxAge,
  };
}

/** 서명, 버전, 형식, 만료시각을 모두 검증한다. */
export function verifyAdminSessionToken(
  token: string | null | undefined,
  now: Date = new Date(),
  env: AdminAuthEnvironment = process.env
): boolean {
  const secret = getCookieSecret(env);
  if (!secret || !token) return false;

  const parts = token.split(".");
  if (parts.length !== 4) return false;

  const [version, expiresRaw, nonce, suppliedSignatureRaw] = parts;
  if (
    version !== TOKEN_VERSION ||
    !/^\d{1,13}$/.test(expiresRaw) ||
    !/^[A-Za-z0-9_-]{24}$/.test(nonce) ||
    !/^[A-Za-z0-9_-]{43}$/.test(suppliedSignatureRaw)
  ) {
    return false;
  }

  const expiresAtSeconds = Number(expiresRaw);
  if (!Number.isSafeInteger(expiresAtSeconds)) return false;

  const payload = `${version}.${expiresRaw}.${nonce}`;
  const expectedSignature = signPayload(payload, secret);
  const suppliedSignature = Buffer.from(suppliedSignatureRaw, "base64url");
  if (
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    return false;
  }

  return expiresAtSeconds > Math.floor(now.getTime() / 1000);
}

export function adminCookieOptions(
  session: Pick<AdminSessionCookie, "expires" | "maxAge">
): AdminCookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: session.expires,
    maxAge: session.maxAge,
  };
}

export function expiredAdminCookieOptions(): AdminCookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  };
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminSessionToken(cookieStore.get(ADMIN_COOKIE_NAME)?.value);
}

/** 보호된 관리자 레이아웃 및 서버 진입점에서 사용한다. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }
}
