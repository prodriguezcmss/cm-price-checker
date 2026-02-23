import { getSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (Number.isNaN(parsed)) return fallback;
  return parsed;
}

function buildHourKey(isoDate) {
  const date = new Date(isoDate);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:00 UTC`;
}

function aggregate(events) {
  const lookups = events.filter((event) => event.event_type === "lookup");
  const successfulLookups = lookups.filter((event) => event.success === true);
  const failedLookups = lookups.filter((event) => event.success === false);

  const cameraStarts = events.filter((event) => event.event_type === "camera_start");
  const barcodeLookups = lookups.filter((event) => event.lookup_type === "barcode");
  const skuLookups = lookups.filter((event) => event.lookup_type === "sku");

  const errorBuckets = new Map();
  for (const event of failedLookups) {
    const key = event.error_message || "Unknown error";
    errorBuckets.set(key, (errorBuckets.get(key) || 0) + 1);
  }

  const missingSearches = new Map();
  for (const event of failedLookups) {
    if (event.error_message !== "No product found") continue;
    const key = event.query_value || "(empty)";
    missingSearches.set(key, (missingSearches.get(key) || 0) + 1);
  }

  const hourlyMap = new Map();
  for (const event of lookups) {
    const hourKey = buildHourKey(event.created_at);
    if (!hourlyMap.has(hourKey)) {
      hourlyMap.set(hourKey, { hour: hourKey, total: 0, success: 0, failed: 0 });
    }

    const row = hourlyMap.get(hourKey);
    row.total += 1;
    if (event.success) row.success += 1;
    if (event.success === false) row.failed += 1;
  }

  const recentFailures = failedLookups.slice(0, 10).map((event) => ({
    createdAt: event.created_at,
    lookupType: event.lookup_type,
    queryValue: event.query_value,
    errorMessage: event.error_message
  }));

  return {
    totals: {
      events: events.length,
      lookups: lookups.length,
      successfulLookups: successfulLookups.length,
      failedLookups: failedLookups.length,
      cameraStarts: cameraStarts.length,
      barcodeLookups: barcodeLookups.length,
      skuLookups: skuLookups.length
    },
    topErrors: Array.from(errorBuckets.entries())
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    topMissingQueries: Array.from(missingSearches.entries())
      .map(([queryValue, count]) => ({ queryValue, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    recentFailures,
    hourly: Array.from(hourlyMap.values()).sort((a, b) =>
      a.hour < b.hour ? -1 : 1
    )
  };
}

export async function GET(request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json(
      { ok: false, error: "Supabase is not configured" },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(request.url);
  const lookbackHours = Math.min(toInt(searchParams.get("hours"), 24), 24 * 14);
  const sinceDate = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from("price_checker_events")
    .select(
      "created_at,event_type,lookup_type,query_value,success,error_message,product_id,product_title"
    )
    .gte("created_at", sinceDate.toISOString())
    .order("created_at", { ascending: false })
    .limit(2000);

  if (error) {
    return Response.json(
      { ok: false, error: "Failed to query analytics" },
      { status: 500 }
    );
  }

  const events = data || [];
  const summary = aggregate(events);

  return Response.json({
    ok: true,
    lookbackHours,
    since: sinceDate.toISOString(),
    totals: summary.totals,
    topErrors: summary.topErrors,
    topMissingQueries: summary.topMissingQueries,
    recentFailures: summary.recentFailures,
    hourly: summary.hourly
  });
}
