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

  const response = NextResponse.redirect(new URL("/?study=ready", req.url), 302);
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
  return response;
}
