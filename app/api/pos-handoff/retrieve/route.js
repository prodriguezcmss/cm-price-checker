import { getSupabaseServerClient } from "@/lib/supabase";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { isPosHandoffEnabled } from "@/lib/feature-flags";
import { getAllowedStoreId, normalizeStoreId } from "@/lib/pos-handoff";
import { getStaffSessionFromRequest } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

function sanitizeCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

export async function GET(request) {
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
    namespace: "pos-handoff-retrieve",
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

  const { searchParams } = new URL(request.url);
  const handoffCode = sanitizeCode(searchParams.get("code"));
  const storeId = normalizeStoreId(searchParams.get("storeId"));

  if (!handoffCode) {
    return Response.json(
      { ok: false, error: "Missing handoff code" },
      { status: 400 }
    );
  }

  const allowedStoreId = getAllowedStoreId();
  if (!storeId || storeId !== allowedStoreId) {
    return Response.json(
      { ok: false, error: "Store is not allowed for handoff" },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from("pos_handoffs")
    .select("id,handoff_code,store_id,status,expires_at,claimed_at,created_at,items")
    .eq("handoff_code", handoffCode)
    .eq("store_id", storeId)
    .single();

  if (error || !data) {
    return Response.json(
      { ok: false, error: "Handoff not found" },
      { status: 404 }
    );
  }

  const isExpired = new Date(data.expires_at).getTime() <= Date.now();
  const effectiveStatus = isExpired && data.status === "open" ? "expired" : data.status;

  return Response.json({
    ok: true,
    handoff: {
      id: data.id,
      code: data.handoff_code,
      storeId: data.store_id,
      status: effectiveStatus,
      expiresAt: data.expires_at,
      claimedAt: data.claimed_at,
      createdAt: data.created_at,
      items: Array.isArray(data.items) ? data.items : []
    }
  });
}
