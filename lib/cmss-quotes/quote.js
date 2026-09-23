import { createHash, randomUUID } from "node:crypto";

export const CONTACT = "shop@cmschoolsupply.com";
export const TERMS = "This is a quote estimate, not an invoice or payment request. Shipping and tax are not included. Product availability, account pricing, and final totals are subject to CM School Supply confirmation.";
export const CALCULATE_QUOTE = `mutation CMSSQuoteCalculate($input: DraftOrderInput!) {
  draftOrderCalculate(input: $input) {
    calculatedDraftOrder {
      presentmentCurrencyCode discountCodes
      subtotalPriceSet { presentmentMoney { amount currencyCode } }
      lineItems { name sku quantity variantTitle customAttributes { key value } originalUnitPriceSet { presentmentMoney { amount currencyCode } } discountedTotalSet { presentmentMoney { amount currencyCode } } }
    }
    userErrors { field message }
  }
}`;

function text(value, max = 200) {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u001f]/.test(value)) throw new Error("Invalid text field");
  return value.trim();
}

function email(value) {
  const normalized = text(value, 254).toLowerCase();
  if (!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(normalized)) throw new Error("Enter a valid email address");
  return normalized;
}

export function cents(value) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(value))) throw new Error("Invalid money");
  const [whole, fraction = ""] = String(value).split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result)) throw new Error("Amount too large");
  return result;
}

export const money = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);

export function normalizeQuoteRequest(input) {
  if (!input || !Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100) throw new Error("Choose 1 to 100 items");
  if (input.currency !== "USD") throw new Error("Please contact CMSS for a quote in this currency");
  if (input.website) throw new Error("Unable to submit this request");
  const contact = { name: text(input.name, 160), company: text(input.company || "", 160), email: email(input.email), phone: text(input.phone || "", 40), notes: text(input.notes || "", 1000) };
  if (!contact.name) throw new Error("Enter your name");
  const items = input.items.map((item) => {
    const id = String(item.variantId);
    if (!/^\d{1,20}$/.test(id) || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 999) throw new Error("Invalid item or quantity");
    if (item.sellingPlan) throw new Error("Please contact CMSS for subscription quotes");
    const properties = item.properties || {};
    if (typeof properties !== "object" || Array.isArray(properties) || Object.keys(properties).length > 20) throw new Error("Invalid item options");
    return { variantId: `gid://shopify/ProductVariant/${id}`, quantity: item.quantity, customAttributes: Object.entries(properties).map(([key, value]) => ({ key: text(key, 100), value: text(String(value), 250) })) };
  });
  const discountCodes = input.discountCodes || [];
  if (!Array.isArray(discountCodes) || discountCodes.length > 5) throw new Error("Too many discount codes");
  return { contact, items, discountCodes: [...new Set(discountCodes.map((code) => text(code, 100).toUpperCase()))].sort(), currency: "USD" };
}

export async function calculateQuote(input, graphql) {
  const request = normalizeQuoteRequest(input);
  const result = await graphql(CALCULATE_QUOTE, { input: { lineItems: request.items, discountCodes: request.discountCodes, acceptAutomaticDiscounts: true, presentmentCurrencyCode: "USD" } });
  const payload = result?.data?.draftOrderCalculate;
  if (result?.errors?.length || payload?.userErrors?.length || !payload?.calculatedDraftOrder) throw new Error("Unable to verify current Shopify prices");
  const draft = payload.calculatedDraftOrder;
  if (draft.presentmentCurrencyCode !== "USD" || draft.subtotalPriceSet?.presentmentMoney?.currencyCode !== "USD" || draft.lineItems.length !== request.items.length) throw new Error("Quote requires staff review");
  const items = draft.lineItems.map((item) => ({ title: item.name, sku: item.sku || "", variant: item.variantTitle || "", quantity: item.quantity, properties: item.customAttributes, unitCents: cents(item.originalUnitPriceSet.presentmentMoney.amount), totalCents: cents(item.discountedTotalSet.presentmentMoney.amount) }));
  const subtotalCents = cents(draft.subtotalPriceSet.presentmentMoney.amount);
  if (!Number.isSafeInteger(input.expectedSubtotalCents) || input.expectedSubtotalCents !== subtotalCents) {
    const error = new Error("Prices changed. Review your updated cart before sending.");
    error.code = "PRICE_REVIEW_REQUIRED";
    error.subtotalCents = subtotalCents;
    throw error;
  }
  return { contact: request.contact, currency: "USD", items, subtotalCents, discountCodes: draft.discountCodes, terms: TERMS };
}

export function freezeQuote(calculated, { id = randomUUID(), createdAt = new Date().toISOString() } = {}) {
  const suffix = id.replaceAll("-", "").slice(0, 8).toUpperCase();
  return { ...calculated, id, number: `CMSS-Q-${createdAt.slice(0, 10).replaceAll("-", "")}-${suffix}`, createdAt };
}

export function fingerprint(input, key) {
  return createHash("sha256").update(`${key}\n${JSON.stringify(normalizeQuoteRequest(input))}`).digest("hex");
}
