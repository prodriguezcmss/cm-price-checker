import { timingSafeEqual, createHmac } from "node:crypto";
import { CONTACT, TERMS, money } from "./quote.js";

const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export function composeEmail(quote, pdf, { team = false } = {}) {
  const recipient = team ? CONTACT : quote.contact.email;
  const subject = `${team ? "New quote request" : "Your CM School Supply quote"} — ${quote.number}`;
  const heading = team ? "New quote request" : "Your classroom quote is ready";
  const rows = quote.items.map((item) => `<tr><td style="padding:12px 0;border-bottom:1px solid #dde3eb">${escape(item.title)}${item.variant ? `<br>${escape(item.variant)}` : ""}<br><small>${escape(item.sku)}</small></td><td style="padding:12px;text-align:right">${item.quantity}</td><td style="padding:12px 0;text-align:right">${money(item.totalCents)}</td></tr>`).join("");
  return {
    from: `CM School Supply <${CONTACT}>`, to: [recipient], reply_to: team ? quote.contact.email : CONTACT, subject,
    text: [heading, `Quote: ${quote.number}`, `For: ${quote.contact.name}`, `Organization: ${quote.contact.company || "-"}`, ...quote.items.map((item) => `${item.quantity} x ${item.title} ${item.variant} - ${money(item.totalCents)}`), `Estimated merchandise subtotal: ${money(quote.subtotalCents)}`, TERMS, `Your PDF is attached. Reply to ${CONTACT} with your quote number for help.`].join("\n"),
    html: `<div style="font-family:Arial,sans-serif;color:#183650;max-width:640px;margin:auto;padding:28px"><p style="font-size:18px;font-weight:bold">CM School Supply</p><hr style="border:0;border-top:3px solid #b52232"><h1 style="font-size:26px">${heading}</h1><p>Hello ${escape(quote.contact.name)},</p><p>Your numbered PDF quote is attached. Reply to this email if you need changes or help placing your order.</p><p><strong>${escape(quote.number)}</strong><br>${escape(quote.contact.company)}</p><table style="width:100%;border-collapse:collapse"><thead><tr><th align="left">Item</th><th align="right">Qty</th><th align="right">Amount</th></tr></thead><tbody>${rows}</tbody></table><p style="font-size:18px"><strong>Estimated merchandise subtotal: ${money(quote.subtotalCents)}</strong></p><p style="font-size:13px;color:#536275">${TERMS}</p><p>shopcmss.com · ${CONTACT}</p></div>`,
    attachments: [{ filename: `${quote.number}.pdf`, content: Buffer.from(pdf).toString("base64") }]
  };
}

export async function sendResend(payload, { idempotencyKey, fetchImpl = fetch } = {}) {
  if (!process.env.CMSS_QUOTE_RESEND_API_KEY) throw new Error("Email sending account is not configured");
  const response = await fetchImpl("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.CMSS_QUOTE_RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id) { const error = new Error("Email provider did not accept this message"); error.retryable = response.status === 429 || response.status >= 500; throw error; }
  return { providerId: data.id, state: "accepted" };
}

export function verifyResendWebhook(rawBody, headers, secret = process.env.CMSS_QUOTE_RESEND_WEBHOOK_SECRET) {
  if (!secret) return false;
  const id = headers.get("svix-id"), timestamp = headers.get("svix-timestamp"), signatures = headers.get("svix-signature") || "";
  if (!id || !timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest("base64");
  return signatures.split(" ").some((entry) => { const value = entry.replace(/^v1,/, ""); const actual = Buffer.from(value); const wanted = Buffer.from(expected); return actual.length === wanted.length && timingSafeEqual(actual, wanted); });
}
