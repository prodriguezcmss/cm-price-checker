const DEFAULT_EXPIRY_MINUTES = 60;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function getHandoffExpiryMinutes() {
  return toPositiveInt(process.env.POS_HANDOFF_EXPIRY_MINUTES, DEFAULT_EXPIRY_MINUTES);
}

export function getAllowedStoreId() {
  return String(process.env.POS_HANDOFF_ALLOWED_STORE_ID || "riverside").trim().toLowerCase();
}

export function normalizeStoreId(value) {
  return String(value || "").trim().toLowerCase();
}

export function generateHandoffCode(length = 6) {
  let output = "";
  for (let i = 0; i < length; i += 1) {
    const idx = Math.floor(Math.random() * CODE_ALPHABET.length);
    output += CODE_ALPHABET[idx];
  }
  return output;
}

export function buildExpiryIso(expiryMinutes = getHandoffExpiryMinutes()) {
  return new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();
}

export function sanitizeItems(items) {
  if (!Array.isArray(items)) return [];

  const normalized = items
    .map((item) => {
      const variantId = String(item?.variantId || "").trim();
      const sku = String(item?.sku || "").trim();
      const barcode = String(item?.barcode || "").trim();
      const title = String(item?.title || "").trim();
      const quantityRaw = Number.parseInt(String(item?.quantity || "1"), 10);
      const quantity = Number.isFinite(quantityRaw) ? quantityRaw : 1;

      return {
        variantId,
        sku,
        barcode,
        title,
        quantity: Math.min(50, Math.max(1, quantity))
      };
    })
    .filter((item) => item.variantId || item.sku || item.barcode);

  return normalized.slice(0, 100);
}
