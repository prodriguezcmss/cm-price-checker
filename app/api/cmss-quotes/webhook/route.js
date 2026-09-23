import { verifyResendWebhook } from "../../../../lib/cmss-quotes/email.js";
import { updateProviderEvent } from "../../../../lib/cmss-quotes/store.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const STATES = { "email.delivered": "delivered", "email.bounced": "bounced", "email.complained": "complained", "email.delivery_delayed": "delayed" };
export async function POST(request) {
  const raw = await request.text();
  if (!verifyResendWebhook(raw, request.headers)) return Response.json({ ok: false }, { status: 401 });
  const event = JSON.parse(raw), state = STATES[event.type];
  if (state && event.data?.email_id) await updateProviderEvent(event.data.email_id, state, request.headers.get("svix-id"));
  return Response.json({ ok: true });
}
