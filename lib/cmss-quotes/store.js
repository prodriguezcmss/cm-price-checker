import { getSupabaseServerClient } from "../supabase.js";

function client() {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Quote storage is not configured");
  return supabase;
}

function unwrap(result, message) {
  if (result.error) {
    console.error(message, {
      code: result.error.code,
      details: result.error.details,
      hint: result.error.hint,
      message: result.error.message
    });
    throw new Error(message);
  }
  return result.data;
}

export async function takeRateLimit(key, limit, windowSeconds) {
  const data = unwrap(await client().rpc("cmss_quote_take_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds }), "Unable to validate request limit");
  return Boolean(data);
}

export async function enqueueQuote(quote, requestFingerprint, customerPayload, teamPayload) {
  const data = unwrap(await client().rpc("cmss_quote_enqueue", { p_quote: quote, p_fingerprint: requestFingerprint, p_customer_payload: customerPayload, p_team_payload: teamPayload }), "Unable to save quote request");
  return Array.isArray(data) ? data[0] : data;
}

export async function claimDelivery(id) {
  const data = unwrap(await client().rpc("cmss_quote_claim_delivery", { p_id: id }), "Unable to claim quote delivery");
  return Array.isArray(data) ? data[0] : data;
}

export async function claimPendingDeliveries(limit = 10) {
  return unwrap(await client().from("cmss_quote_deliveries").select("id").in("state", ["pending", "retry"]).lte("next_attempt_at", new Date().toISOString()).order("created_at", { ascending: true }).limit(limit), "Unable to list pending quote deliveries") || [];
}

export async function acceptDelivery(id, leaseToken, providerId) {
  unwrap(await client().rpc("cmss_quote_accept_delivery", { p_id: id, p_lease_token: leaseToken, p_provider_id: providerId }), "Unable to record quote delivery");
}

export async function failDelivery(id, leaseToken, retryable, message) {
  unwrap(await client().rpc("cmss_quote_fail_delivery", { p_id: id, p_lease_token: leaseToken, p_retryable: retryable, p_error: String(message).slice(0, 500) }), "Unable to record delivery failure");
}

export async function updateProviderEvent(providerId, state, eventId) {
  unwrap(await client().rpc("cmss_quote_provider_event", { p_provider_id: providerId, p_state: state, p_event_id: eventId }), "Unable to record email event");
}
