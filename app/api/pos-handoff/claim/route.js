import { getSupabaseServerClient } from "@/lib/supabase";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { isPosHandoffEnabled } from "@/lib/feature-flags";
import { buildPosCartLines, getAllowedStoreId, normalizeStoreId } from "@/lib/pos-handoff";
import { getStaffSessionFromRequest } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

function sanitizeCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

export async function POST(request) {
  if (!isPosHandoffEnabled()) {
    return Response.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const session = getStaffSessionFromRequest(request);
  if (!session) {
    return Response.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit({
    namespace: "pos-handoff-claim",
    key: ip,
    maxRequests: 60,
    windowMs: 60 * 1000
  });

  if (!rateLimit.allowed) {
    return Response.json(
      { ok: false, error: "Too many requests. Please wait and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) }
      }
    );
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json(
      { ok: false, error: "Supabase is not configured" },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const handoffCode = sanitizeCode(body?.code);
  const storeId = normalizeStoreId(body?.storeId);
  const staffUserId = session.staffId;

  if (!handoffCode || !storeId) {
    return Response.json(
      { ok: false, error: "Missing code or storeId" },
      { status: 400 }
    );
  }

  const allowedStoreId = getAllowedStoreId();
  if (storeId !== allowedStoreId) {
    return Response.json(
      { ok: false, error: "Store is not allowed for handoff" },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from("pos_handoffs")
    .select("id,handoff_code,store_id,status,expires_at,items")
    .eq("handoff_code", handoffCode)
    .eq("store_id", storeId)
    .single();

  if (error || !data) {
    return Response.json(
      { ok: false, error: "Handoff not found" },
      { status: 404 }
    );
  }

  if (data.status !== "open") {
    return Response.json(
      { ok: false, error: `Handoff is ${data.status}` },
      { status: 409 }
    );
  }

  if (new Date(data.expires_at).getTime() <= Date.now()) {
    await supabase
      .from("pos_handoffs")
      .update({ status: "expired" })
      .eq("id", data.id)
      .eq("status", "open");

    return Response.json(
      { ok: false, error: "Handoff has expired" },
      { status: 410 }
    );
  }

  const claimedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("pos_handoffs")
    .update({
      status: "claimed",
      claimed_at: claimedAt,
      claimed_by_staff_user_id: staffUserId
    })
    .eq("id", data.id)
    .eq("status", "open");

  if (updateError) {
    return Response.json(
      { ok: false, error: "Failed to claim handoff" },
      { status: 500 }
    );
  }

  return Response.json({
    ok: true,
    handoff: {
      id: data.id,
      code: data.handoff_code,
      storeId: data.store_id,
      status: "claimed",
      claimedAt,
      items: Array.isArray(data.items) ? data.items : [],
      cartLines: buildPosCartLines(data.items)
    }
  });
}
