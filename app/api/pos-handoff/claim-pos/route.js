import { getSupabaseServerClient } from "@/lib/supabase";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { isPosHandoffEnabled } from "@/lib/feature-flags";
import { buildPosCartLines, getAllowedStoreId, normalizeStoreId } from "@/lib/pos-handoff";
import { validateStaffPinLogin } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "86400"
};

function sanitizeCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

function jsonWithCors(body, init = {}) {
  return Response.json(body, {
    ...init,
    headers: {
      ...CORS_HEADERS,
      ...(init.headers || {})
    }
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}

export async function POST(request) {
  if (!isPosHandoffEnabled()) {
    return jsonWithCors({ ok: false, error: "Not found" }, { status: 404 });
  }

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit({
    namespace: "pos-handoff-claim-pos",
    key: ip,
    maxRequests: 60,
    windowMs: 60 * 1000
  });

  if (!rateLimit.allowed) {
    return jsonWithCors(
      { ok: false, error: "Too many requests. Please wait and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) }
      }
    );
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return jsonWithCors(
      { ok: false, error: "Supabase is not configured" },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const handoffCode = sanitizeCode(body?.code);
  const storeId = normalizeStoreId(body?.storeId);
  const staffId = String(body?.staffId || "").trim();
  const pin = String(body?.pin || "");

  if (!handoffCode || !storeId || !staffId || !pin) {
    return jsonWithCors(
      { ok: false, error: "Missing code, storeId, staffId, or pin" },
      { status: 400 }
    );
  }

  const auth = validateStaffPinLogin({ staffId, pin });
  if (!auth.ok) {
    return jsonWithCors({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const allowedStoreId = getAllowedStoreId();
  if (storeId !== allowedStoreId) {
    return jsonWithCors(
      { ok: false, error: "Store is not allowed for handoff" },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from("pos_handoffs")
    .select("id,handoff_code,store_id,status,expires_at,items,claimed_at,claimed_by_staff_user_id")
    .eq("handoff_code", handoffCode)
    .eq("store_id", storeId)
    .single();

  if (error || !data) {
    return jsonWithCors(
      { ok: false, error: "Handoff not found" },
      { status: 404 }
    );
  }

  if (data.status === "claimed") {
    // Idempotent retry for the same staff member in POS in case cart add failed client-side.
    if (String(data.claimed_by_staff_user_id || "") === auth.staffId) {
      return jsonWithCors({
        ok: true,
        handoff: {
          id: data.id,
          code: data.handoff_code,
          storeId: data.store_id,
          status: "claimed",
          claimedAt: data.claimed_at || null,
          items: Array.isArray(data.items) ? data.items : [],
          cartLines: buildPosCartLines(data.items)
        },
        retry: true
      });
    }

    return jsonWithCors(
      { ok: false, error: "Handoff is claimed" },
      { status: 409 }
    );
  }

  if (data.status !== "open") {
    return jsonWithCors(
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

    return jsonWithCors(
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
      claimed_by_staff_user_id: auth.staffId
    })
    .eq("id", data.id)
    .eq("status", "open");

  if (updateError) {
    return jsonWithCors(
      { ok: false, error: "Failed to claim handoff" },
      { status: 500 }
    );
  }

  return jsonWithCors({
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
