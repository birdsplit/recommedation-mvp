import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  expiredAdminCookieOptions,
} from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const response = NextResponse.redirect(
    new URL("/admin/login", request.url),
    303
  );
  response.cookies.set(
    ADMIN_COOKIE_NAME,
    "",
    expiredAdminCookieOptions()
  );
  return response;
}
