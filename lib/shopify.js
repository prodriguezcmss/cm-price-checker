const DEFAULT_VERSION = "2026-07";

import { getSupabaseServerClient } from "./supabase.js";

export function getShopifyConfig({ shop, token } = {}) {
  const resolvedShop = shop || process.env.SHOPIFY_SHOP;
  const resolvedToken = token || process.env.SHOPIFY_ACCESS_TOKEN;
  const version = process.env.SHOPIFY_API_VERSION || DEFAULT_VERSION;

  if (!resolvedShop || !resolvedToken) return null;
  return { shop: resolvedShop, token: resolvedToken, version };
}

export async function resolveShopifyConfig() {
  let shop = String(process.env.SHOPIFY_SHOP || "").trim().toLowerCase();
  let token = String(process.env.SHOPIFY_ACCESS_TOKEN || "").trim();

  if ((!shop || !token) && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const supabase = getSupabaseServerClient();
    let query = supabase
      .from("shop_tokens")
      .select("shop,access_token,installed_at")
      .order("installed_at", { ascending: false })
      .limit(1);

    if (shop) query = query.eq("shop", shop);
    const { data, error } = await query;
    if (error) throw new Error("Unable to load Shopify credentials");

    const row = Array.isArray(data) ? data[0] : null;
    if (row) {
      if (!shop) shop = String(row.shop || "").trim().toLowerCase();
      if (!token) token = String(row.access_token || "").trim();
    }
  }

  return getShopifyConfig({ shop: shop || null, token: token || null });
}

export async function shopifyGraphQL(query, variables = {}, configOverride) {
  const config = getShopifyConfig(configOverride);
  if (!config) {
    return { data: null, errors: [{ message: "Missing Shopify credentials" }] };
  }

  const res = await fetch(
    `https://${config.shop}/admin/api/${config.version}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": config.token
      },
      body: JSON.stringify({ query, variables })
    }
  );

  const json = await res.json();
  return json;
}

export async function fetchCustomers(limit = 25, configOverride) {
  const query = `
    query Customers($first: Int!) {
      customers(first: $first) {
        edges {
          node {
            id
            firstName
            lastName
            email
            phone
            createdAt
            updatedAt
          }
        }
      }
    }
  `;

  const { data, errors } = await shopifyGraphQL(
    query,
    { first: limit },
    configOverride
  );
  return { data, errors };
}

export async function fetchCompanies(limit = 25, configOverride) {
  const query = `
    query Companies($first: Int!) {
      companies(first: $first) {
        edges {
          node {
            id
            name
            createdAt
            updatedAt
          }
        }
      }
    }
  `;

  const { data, errors } = await shopifyGraphQL(
    query,
    { first: limit },
    configOverride
  );
  return { data, errors };
}
