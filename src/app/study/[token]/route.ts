import { NextResponse } from "next/server";
import { verifyStudyToken } from "@/lib/study-token";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
): Promise<Response> {
  const { token } = await params;
  const payload = verifyStudyToken(token);
  if (!payload) {
    return NextResponse.redirect(new URL("/?study=invalid", req.url), 302);
  }

  // 코호트가 실험 팔(loop/oneshot)이면 해당 흐름 진입점으로 바로 보내고,
  // 그 외에는 기존과 동일하게 랜딩(/?study=ready)으로 보낸다.
  const isModeCohort =
    payload.cohort === "loop" || payload.cohort === "oneshot";
  const destination = isModeCohort
    ? payload.cohort === "loop"
      ? "/browse/intake"
      : "/q/1"
    : "/?study=ready";

  const response = NextResponse.redirect(new URL(destination, req.url), 302);
  const maxAge = Math.max(1, payload.exp - Math.floor(Date.now() / 1_000));
  response.cookies.set("modoo_test", "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
  response.cookies.set("modoo_cohort", payload.cohort, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
  // 실험 팔이면 클라이언트가 읽는 non-HttpOnly modoo_mode를 함께 고정한다.
  if (isModeCohort) {
    response.cookies.set("modoo_mode", payload.cohort, {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge,
    });
  }
  return response;
}
