import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  createStaffSessionToken,
  getStaffSessionCookieName,
  getStaffSessionMaxAge,
  isStaffAuthConfigured,
  validateStaffPinLogin
} from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const ip = getClientIp(request);
  const rateLimit = checkRateLimit({
    namespace: "staff-auth-login",
    key: ip,
    maxRequests: 20,
    windowMs: 60 * 1000
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many login attempts. Please wait and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) }
      }
    );
  }

  if (!isStaffAuthConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Staff auth is not configured" },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const staffId = String(body?.staffId || "").trim();
  const pin = String(body?.pin || "");

  const result = validateStaffPinLogin({ staffId, pin });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: "Invalid credentials" },
      { status: 401 }
    );
  }

  const token = createStaffSessionToken(result.staffId);
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Failed to create session" },
      { status: 500 }
    );
  }

  const response = NextResponse.json({ ok: true, staffId: result.staffId });
  const isProduction = process.env.NODE_ENV === "production";
  response.cookies.set(getStaffSessionCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: getStaffSessionMaxAge(),
    path: "/"
  });

  return response;
}
