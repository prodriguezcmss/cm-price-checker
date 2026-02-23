import crypto from "crypto";

export function isValidShop(shop) {
  if (!shop) return false;
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}

export function generateState() {
  return crypto.randomBytes(16).toString("hex");
}

export function verifyHmac(query, secret) {
  const params = new URLSearchParams(query);
  const hmac = params.get("hmac");
  params.delete("hmac");
  params.delete("signature");

  const message = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const digest = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex");

  return hmac && crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(digest));
}
