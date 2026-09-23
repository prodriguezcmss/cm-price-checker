import { sendResend } from "./email.js";
import { acceptDelivery, claimDelivery, failDelivery } from "./store.js";

export async function deliverById(id) {
  const job = await claimDelivery(id);
  if (!job) return "busy";
  if (job.first_attempt_at && Date.now() - Date.parse(job.first_attempt_at) >= 23 * 60 * 60 * 1000) {
    await failDelivery(job.id, job.lease_token, false, "idempotency_window");
    return "review";
  }
  try {
    const result = await sendResend(job.payload, { idempotencyKey: `cmss-quote/${job.id}` });
    await acceptDelivery(job.id, job.lease_token, result.providerId);
    return "accepted";
  } catch (error) {
    await failDelivery(job.id, job.lease_token, error.retryable !== false, error.message);
    throw error;
  }
}
