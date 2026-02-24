import { getStaffSessionFromRequest, isStaffAuthConfigured } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!isStaffAuthConfigured()) {
    return Response.json({ ok: false, error: "Staff auth is not configured" }, { status: 500 });
  }

  const session = getStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ ok: true, authenticated: false });
  }

  return Response.json({ ok: true, authenticated: true, staffId: session.staffId });
}
