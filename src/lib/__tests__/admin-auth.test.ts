import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import {
  ADMIN_COOKIE_NAME,
  ADMIN_SESSION_TTL_SECONDS,
  adminCookieOptions,
  createAdminSessionCookie,
  expiredAdminCookieOptions,
  isAdminAuthConfigured,
  isAdminAuthenticated,
  requireAdmin,
  verifyAdminPassword,
  verifyAdminSessionToken,
} from "@/lib/admin-auth";
import { POST as login } from "@/app/api/admin/login/route";
import { POST as logout } from "@/app/api/admin/logout/route";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const PASSWORD = "correct horse battery staple";
const SECRET = "test-cookie-secret-that-is-long-enough";
const NOW = new Date("2026-07-11T00:00:00.000Z");

function loginRequest(password: string): Request {
  return new Request("http://localhost/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ password }),
  });
}

describe("admin auth", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_PASSWORD", PASSWORD);
    vi.stubEnv("ADMIN_COOKIE_SECRET", SECRET);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("환경변수가 모두 있을 때만 설정 완료로 본다", () => {
    expect(isAdminAuthConfigured()).toBe(true);
    vi.stubEnv("ADMIN_COOKIE_SECRET", "");
    expect(isAdminAuthConfigured()).toBe(false);
  });

  it("관리자 비밀번호를 고정 길이 다이제스트로 안전하게 비교한다", () => {
    expect(verifyAdminPassword(PASSWORD)).toBe(true);
    expect(verifyAdminPassword(`${PASSWORD}!`)).toBe(false);
    vi.stubEnv("ADMIN_PASSWORD", "");
    expect(verifyAdminPassword("")).toBe(false);
  });

  it("HMAC 세션을 검증하고 변조·다른 비밀키·만료를 거부한다", () => {
    const session = createAdminSessionCookie(NOW);
    expect(verifyAdminSessionToken(session.value, NOW)).toBe(true);

    const last = session.value.at(-1);
    const tampered = `${session.value.slice(0, -1)}${last === "a" ? "b" : "a"}`;
    expect(verifyAdminSessionToken(tampered, NOW)).toBe(false);

    vi.stubEnv("ADMIN_COOKIE_SECRET", `${SECRET}-other`);
    expect(verifyAdminSessionToken(session.value, NOW)).toBe(false);
    vi.stubEnv("ADMIN_COOKIE_SECRET", SECRET);

    const expiredAt = new Date(
      NOW.getTime() + ADMIN_SESSION_TTL_SECONDS * 1000
    );
    expect(verifyAdminSessionToken(session.value, expiredAt)).toBe(false);
  });

  it("세션과 삭제 쿠키에 보안 속성과 만료를 지정한다", () => {
    const session = createAdminSessionCookie(NOW);
    expect(session.maxAge).toBe(ADMIN_SESSION_TTL_SECONDS);
    expect(session.expires.getTime()).toBe(
      NOW.getTime() + ADMIN_SESSION_TTL_SECONDS * 1000
    );
    expect(adminCookieOptions(session)).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: ADMIN_SESSION_TTL_SECONDS,
    });
    expect(expiredAdminCookieOptions()).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    vi.stubEnv("NODE_ENV", "production");
    expect(adminCookieOptions(session).secure).toBe(true);
    expect(expiredAdminCookieOptions().secure).toBe(true);
  });

  it("올바른 로그인은 303과 서명된 httpOnly 쿠키를 반환한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    const response = await login(loginRequest(PASSWORD));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/admin");

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${ADMIN_COOKIE_NAME}=`);
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
    expect(setCookie).toContain("Path=/");
    const value = setCookie.match(
      new RegExp(`${ADMIN_COOKIE_NAME}=([^;]+)`)
    )?.[1];
    expect(verifyAdminSessionToken(value, NOW)).toBe(true);
  });

  it("잘못된 로그인은 쿠키 없이 오류 화면으로 돌려보낸다", async () => {
    const response = await login(loginRequest("wrong"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/admin/login?error=invalid"
    );
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("지원하지 않는 형식과 실제 4KB를 넘는 로그인 본문을 거부한다", async () => {
    const jsonResponse = await login(
      new Request("http://localhost/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: PASSWORD }),
      })
    );
    expect(jsonResponse.headers.get("location")).toBe(
      "http://localhost/admin/login?error=invalid"
    );
    expect(jsonResponse.headers.get("set-cookie")).toBeNull();

    const oversizedResponse = await login(
      new Request("http://localhost/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `padding=${"가".repeat(1400)}&password=${encodeURIComponent(
          PASSWORD
        )}`,
      })
    );
    expect(oversizedResponse.headers.get("location")).toBe(
      "http://localhost/admin/login?error=invalid"
    );
    expect(oversizedResponse.headers.get("set-cookie")).toBeNull();
  });

  it("Supabase 설정과 무관하게 관리자 환경변수만으로 로그인한다", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const response = await login(loginRequest(PASSWORD));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/admin");
  });

  it("로그아웃은 동일한 쿠키를 즉시 만료시키고 로그인으로 이동한다", async () => {
    const response = await logout(
      new Request("http://localhost/api/admin/logout", { method: "POST" })
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/admin/login"
    );
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${ADMIN_COOKIE_NAME}=`);
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
  });

  it("보호 경계는 유효한 쿠키만 허용하고 미인증 요청을 로그인으로 보낸다", async () => {
    const session = createAdminSessionCookie();
    const cookiesMock = vi.mocked(cookies);

    cookiesMock.mockResolvedValueOnce({
      get: () => ({ name: ADMIN_COOKIE_NAME, value: session.value }),
    } as Awaited<ReturnType<typeof cookies>>);
    expect(await isAdminAuthenticated()).toBe(true);

    cookiesMock.mockResolvedValueOnce({
      get: () => undefined,
    } as unknown as Awaited<ReturnType<typeof cookies>>);
    await requireAdmin();
    expect(redirect).toHaveBeenCalledOnce();
    expect(redirect).toHaveBeenCalledWith("/admin/login");
  });
});
