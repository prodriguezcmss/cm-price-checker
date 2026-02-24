import { getSupabaseServerClient } from "@/lib/supabase";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function sanitize(value) {
  return String(value || "").trim();
}

function getRequestMeta(request) {
  const userAgent = request.headers.get("user-agent") || "";
  const ip = getClientIp(request);
  return { userAgent, ip };
}

export async function POST(request) {
  const ip = getClientIp(request);
  const rateLimit = checkRateLimit({
    namespace: "price-checker-analytics-track",
    key: ip,
    maxRequests: 60,
    windowMs: 60 * 1000
  });

  if (!rateLimit.allowed) {
    return Response.json(
      { ok: false, error: "Rate limited" },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds)
        }
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
  const eventType = sanitize(body?.eventType);

  if (!eventType) {
    return Response.json(
      { ok: false, error: "Missing eventType" },
      { status: 400 }
    );
  }

  const lookupType = sanitize(body?.lookupType) || null;
  const queryValue = sanitize(body?.queryValue) || null;
  const success = typeof body?.success === "boolean" ? body.success : null;
  const errorMessage = sanitize(body?.errorMessage) || null;
  const meta = body?.meta && typeof body.meta === "object" ? body.meta : {};
  const { userAgent, ip: requestIp } = getRequestMeta(request);

  const { error } = await supabase.from("price_checker_events").insert({
    event_type: eventType,
    lookup_type: lookupType,
    query_value: queryValue,
    success,
    error_message: errorMessage,
    user_agent: userAgent,
    ip_address: requestIp,
    meta
  });

  if (error) {
    return Response.json(
      { ok: false, error: "Failed to log analytics event" },
      { status: 500 }
    );
  }

  return Response.json({ ok: true });
}
