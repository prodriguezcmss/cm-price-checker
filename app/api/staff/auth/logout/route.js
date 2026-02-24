import { NextResponse } from "next/server";
import { getStaffSessionCookieName } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  const isProduction = process.env.NODE_ENV === "production";
  response.cookies.set(getStaffSessionCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: 0,
    path: "/"
  });
  return response;
}
