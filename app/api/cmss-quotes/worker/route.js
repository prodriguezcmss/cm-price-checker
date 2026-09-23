import { timingSafeEqual } from "node:crypto";
import { deliverById } from "../../../../lib/cmss-quotes/deliver.js";
import { claimPendingDeliveries } from "../../../../lib/cmss-quotes/store.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function authorized(request) {
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`), actual = Buffer.from(request.headers.get("authorization") || "");
  return process.env.CRON_SECRET && expected.length === actual.length && timingSafeEqual(expected, actual);
}
export async function GET(request) {
  if (!authorized(request)) return Response.json({ ok: false }, { status: 401 });
  const jobs = await claimPendingDeliveries(10);
  const results = await Promise.allSettled(jobs.map((job) => deliverById(job.id)));
  return Response.json({ ok: true, processed: results.length, failed: results.filter((result) => result.status === "rejected").length });
}
