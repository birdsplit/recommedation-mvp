import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  adminCookieOptions,
  createAdminSessionCookie,
  isAdminAuthConfigured,
  verifyAdminPassword,
} from "@/lib/admin-auth";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 4096;
const MAX_PASSWORD_LENGTH = 1024;

function redirectTo(request: Request, pathname: string): NextResponse {
  return NextResponse.redirect(new URL(pathname, request.url), 303);
}

export async function POST(request: Request): Promise<NextResponse> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return redirectTo(request, "/admin/login?error=invalid");
  }

  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") {
    return redirectTo(request, "/admin/login?error=invalid");
  }

  if (!isAdminAuthConfigured()) {
    console.error(
      "관리자 로그인 환경변수가 없습니다: ADMIN_PASSWORD와 ADMIN_COOKIE_SECRET을 확인하세요."
    );
    return redirectTo(request, "/admin/login?error=config");
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return redirectTo(request, "/admin/login?error=invalid");
  }

  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return redirectTo(request, "/admin/login?error=invalid");
  }

  const formData = new URLSearchParams(rawBody);
  const passwordValues = formData.getAll("password");
  const password = passwordValues[0];
  if (
    passwordValues.length !== 1 ||
    typeof password !== "string" ||
    password.length === 0 ||
    password.length > MAX_PASSWORD_LENGTH ||
    !verifyAdminPassword(password)
  ) {
    return redirectTo(request, "/admin/login?error=invalid");
  }

  const session = createAdminSessionCookie();
  const response = redirectTo(request, "/admin");
  response.cookies.set(
    ADMIN_COOKIE_NAME,
    session.value,
    adminCookieOptions(session)
  );
  return response;
}
