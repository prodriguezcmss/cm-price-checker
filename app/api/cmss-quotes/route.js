import { createHash, randomUUID } from "node:crypto";
import { shopifyGraphQL } from "../../../lib/shopify.js";
import { calculateQuote, fingerprint, freezeQuote } from "../../../lib/cmss-quotes/quote.js";
import { composeEmail } from "../../../lib/cmss-quotes/email.js";
import { renderQuotePdf } from "../../../lib/cmss-quotes/pdf.js";
import { deliverById } from "../../../lib/cmss-quotes/deliver.js";
import { enqueueQuote, takeRateLimit } from "../../../lib/cmss-quotes/store.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ALLOWED_ORIGINS = new Set(["https://shopcmss.com", "https://www.shopcmss.com", "https://shopcmss.myshopify.com"]);
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'" };

function reply(body, status, origin) {
  return Response.json(body, { status, headers: { ...headers, ...(origin && ALLOWED_ORIGINS.has(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}) } });
}

function clientKey(request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`${process.env.CMSS_QUOTE_RATE_LIMIT_SALT || "missing"}:${ip}`).digest("hex");
}

export async function OPTIONS(request) {
  const origin = request.headers.get("origin");
  if (!ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403, headers });
  return new Response(null, { status: 204, headers: { ...headers, "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Idempotency-Key", "Access-Control-Max-Age": "600", Vary: "Origin" } });
}

export async function POST(request) {
  const origin = request.headers.get("origin");
  if (!ALLOWED_ORIGINS.has(origin)) return reply({ ok: false, error: "Open the quote form from shopcmss.com." }, 403);
  if (!process.env.CMSS_QUOTE_RATE_LIMIT_SALT) return reply({ ok: false, error: "Quote service is unavailable." }, 503, origin);
  if (Number(request.headers.get("content-length") || 0) > 65536) return reply({ ok: false, error: "Quote request is too large." }, 413, origin);
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 65536) return reply({ ok: false, error: "Quote request is too large." }, 413, origin);
  let input;
  try { input = JSON.parse(raw); } catch { return reply({ ok: false, error: "Invalid quote request." }, 400, origin); }
  const idempotencyKey = request.headers.get("idempotency-key") || "";
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(idempotencyKey)) return reply({ ok: false, error: "Reload the cart and try again." }, 400, origin);
  try {
    if (!await takeRateLimit(`ip:${clientKey(request)}`, 8, 3600)) return reply({ ok: false, error: "Too many quote requests. Please try again later." }, 429, origin);
    const calculated = await calculateQuote(input, shopifyGraphQL);
    const quote = freezeQuote(calculated, { id: randomUUID() });
    const pdf = await renderQuotePdf(quote);
    const saved = await enqueueQuote(quote, fingerprint(input, idempotencyKey), composeEmail(quote, pdf), composeEmail(quote, pdf, { team: true }));
    const outcomes = await Promise.allSettled((saved.delivery_ids || []).map(deliverById));
    const accepted = outcomes.filter((outcome) => outcome.status === "fulfilled" && ["accepted", "busy"].includes(outcome.value)).length;
    return reply({ ok: true, quoteNumber: saved.quote_number, emailQueued: accepted === outcomes.length }, saved.created ? 201 : 200, origin);
  } catch (error) {
    if (error.code === "PRICE_REVIEW_REQUIRED") return reply({ ok: false, code: error.code, subtotalCents: error.subtotalCents, error: error.message }, 409, origin);
    console.error("CMSS quote submission failed", { message: error.message });
    return reply({ ok: false, error: "We could not send your quote. Please try again or email shop@cmschoolsupply.com." }, 500, origin);
  }
}
