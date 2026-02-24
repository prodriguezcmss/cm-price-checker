import { getSupabaseServerClient } from "@/lib/supabase";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { isPosHandoffEnabled } from "@/lib/feature-flags";
import {
  buildExpiryIso,
  generateHandoffCode,
  getAllowedStoreId,
  normalizeStoreId,
  sanitizeItems
} from "@/lib/pos-handoff";

export const dynamic = "force-dynamic";

async function insertHandoff(supabase, payload) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const handoffCode = generateHandoffCode(6);
    const { data, error } = await supabase
      .from("pos_handoffs")
      .insert({ ...payload, handoff_code: handoffCode })
      .select("handoff_code,expires_at")
      .single();

    if (!error && data) {
      return { data, error: null };
    }

    const duplicate = error?.code === "23505";
    if (!duplicate) return { data: null, error };
  }

  return {
    data: null,
    error: new Error("Unable to generate unique handoff code")
  };
}

export async function POST(request) {
  if (!isPosHandoffEnabled()) {
    return Response.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit({
    namespace: "pos-handoff-create",
    key: ip,
    maxRequests: 20,
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
  const storeId = normalizeStoreId(body?.storeId);
  const allowedStoreId = getAllowedStoreId();
  if (!storeId || storeId !== allowedStoreId) {
    return Response.json(
      { ok: false, error: "Store is not allowed for handoff" },
      { status: 403 }
    );
  }

  const items = sanitizeItems(body?.items);
  if (!items.length) {
    return Response.json(
      { ok: false, error: "No valid items provided" },
      { status: 400 }
    );
  }

  const sessionId = String(body?.sessionId || "").trim() || null;
  const expiresAt = buildExpiryIso();

  const payload = {
    store_id: storeId,
    status: "open",
    expires_at: expiresAt,
    customer_session_id: sessionId,
    items,
    source: "price-checker-web"
  };

  const { data, error } = await insertHandoff(supabase, payload);
  if (error || !data) {
    return Response.json(
      { ok: false, error: "Failed to create handoff" },
      { status: 500 }
    );
  }

  return Response.json({
    ok: true,
    handoffCode: data.handoff_code,
    expiresAt: data.expires_at,
    itemCount: items.length
  });
}
