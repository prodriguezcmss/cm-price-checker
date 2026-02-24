import { getSupabaseServerClient } from "@/lib/supabase";
import { getShopifyConfig, shopifyGraphQL } from "@/lib/shopify";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const PRODUCT_BY_CODE_QUERY = `
  query ProductByCode($search: String!) {
    productVariants(first: 1, query: $search) {
      edges {
        node {
          id
          sku
          barcode
          price
          compareAtPrice
          product {
            id
            title
            description
            onlineStoreUrl
            featuredImage {
              url
              altText
            }
          }
        }
      }
    }
  }
`;

const SUGGEST_VARIANTS_QUERY = `
  query SuggestedVariants($search: String!) {
    productVariants(first: 5, query: $search) {
      edges {
        node {
          id
          sku
          barcode
          product {
            id
            title
            onlineStoreUrl
            featuredImage {
              url
              altText
            }
          }
        }
      }
    }
  }
`;

function sanitizeInput(value) {
  return String(value || "").trim();
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapVariant(variantNode) {
  const compareAtPrice = Number(variantNode.compareAtPrice || 0);
  const currentPrice = Number(variantNode.price || 0);
  const hasSalePrice = compareAtPrice > currentPrice;

  return {
    productId: variantNode.product?.id,
    variantId: variantNode.id,
    title: variantNode.product?.title || "Unknown Product",
    description: stripHtml(variantNode.product?.description || ""),
    imageUrl: variantNode.product?.featuredImage?.url || null,
    imageAlt: variantNode.product?.featuredImage?.altText || null,
    barcode: variantNode.barcode || "",
    sku: variantNode.sku || "",
    productPrice: currentPrice,
    salePrice: hasSalePrice ? currentPrice : null,
    compareAtPrice: hasSalePrice ? compareAtPrice : null,
    onlineStoreUrl: variantNode.product?.onlineStoreUrl || null,
    currency: "USD",
    lastUpdatedAt: new Date().toISOString()
  };
}

function mapSuggestion(variantNode) {
  return {
    productId: variantNode.product?.id || null,
    variantId: variantNode.id || null,
    title: variantNode.product?.title || "Unknown Product",
    sku: variantNode.sku || "",
    barcode: variantNode.barcode || "",
    imageUrl: variantNode.product?.featuredImage?.url || null,
    imageAlt: variantNode.product?.featuredImage?.altText || null,
    onlineStoreUrl: variantNode.product?.onlineStoreUrl || null
  };
}

async function fetchSuggestions({ type, rawCode, config }) {
  const cleaned = rawCode.replace(/"/g, "").trim();
  if (!cleaned || type !== "sku") return [];

  const search = cleaned.length >= 3 ? `sku:${cleaned}*` : `sku:${cleaned}`;
  const { data, errors } = await shopifyGraphQL(
    SUGGEST_VARIANTS_QUERY,
    { search },
    config
  );

  if (errors?.length) return [];
  const edges = data?.productVariants?.edges || [];
  return edges
    .map((edge) => mapSuggestion(edge?.node || {}))
    .filter((item) => item.sku || item.barcode || item.title);
}

function getRequestMeta(request) {
  const userAgent = request.headers.get("user-agent") || "";
  const ip = getClientIp(request);
  return { userAgent, ip };
}

async function logPriceCheckerEvent(supabase, event) {
  if (!supabase) return;
  await supabase.from("price_checker_events").insert(event);
}

async function resolveShopifyAdminConfig() {
  let shop = sanitizeInput(process.env.SHOPIFY_SHOP).toLowerCase() || null;
  let token = sanitizeInput(process.env.SHOPIFY_ACCESS_TOKEN) || null;

  if (!token || !shop) {
    const supabase = getSupabaseServerClient();
    if (supabase) {
      let query = supabase
        .from("shop_tokens")
        .select("shop,access_token,installed_at")
        .order("installed_at", { ascending: false })
        .limit(1);

      if (shop) {
        query = query.eq("shop", shop);
      }

      const { data } = await query;
      const row = Array.isArray(data) ? data[0] : null;

      if (row) {
        if (!shop) shop = sanitizeInput(row.shop).toLowerCase() || null;
        if (!token) token = sanitizeInput(row.access_token) || null;
      }
    }
  }

  return getShopifyConfig({ shop, token });
}

export async function GET(request) {
  const supabase = getSupabaseServerClient();
  const { userAgent, ip } = getRequestMeta(request);
  const rateLimit = checkRateLimit({
    namespace: "price-checker-lookup",
    key: ip,
    maxRequests: 30,
    windowMs: 60 * 1000
  });

  if (!rateLimit.allowed) {
    return Response.json(
      {
        ok: false,
        error: "Too many requests. Please wait a moment and try again."
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds)
        }
      }
    );
  }

  const { searchParams } = new URL(request.url);
  const barcode = sanitizeInput(searchParams.get("barcode"));
  const sku = sanitizeInput(searchParams.get("sku"));

  const type = barcode ? "barcode" : "sku";
  const rawCode = barcode || sku;

  if (!rawCode) {
    try {
      await logPriceCheckerEvent(supabase, {
        event_type: "lookup",
        lookup_type: type,
        query_value: rawCode,
        success: false,
        error_message: "Missing query parameter",
        user_agent: userAgent,
        ip_address: ip
      });
    } catch {}

    return Response.json(
      {
        ok: false,
        error: "Provide barcode or sku query parameter"
      },
      { status: 400 }
    );
  }

  const config = await resolveShopifyAdminConfig();
  if (!config) {
    try {
      await logPriceCheckerEvent(supabase, {
        event_type: "lookup",
        lookup_type: type,
        query_value: rawCode,
        success: false,
        error_message: "Missing Shopify credentials",
        user_agent: userAgent,
        ip_address: ip
      });
    } catch {}

    return Response.json(
      {
        ok: false,
        error: "Missing Shopify credentials"
      },
      { status: 400 }
    );
  }

  const search = `${type}:${rawCode.replace(/"/g, "")}`;
  const { data, errors } = await shopifyGraphQL(
    PRODUCT_BY_CODE_QUERY,
    { search },
    config
  );

  if (errors?.length) {
    const resolvedError =
      errors?.[0]?.message ||
      (typeof errors === "string" ? errors : null) ||
      "Shopify query failed";
    try {
      await logPriceCheckerEvent(supabase, {
        event_type: "lookup",
        lookup_type: type,
        query_value: rawCode,
        success: false,
        error_message: resolvedError,
        user_agent: userAgent,
        ip_address: ip,
        meta: {
          shop: config.shop,
          apiVersion: config.version
        }
      });
    } catch {}

    return Response.json(
      {
        ok: false,
        error: resolvedError,
        details: errors,
        debug: {
          shop: config.shop,
          apiVersion: config.version,
          queryType: type
        }
      },
      { status: 502 }
    );
  }

  const variantNode = data?.productVariants?.edges?.[0]?.node;
  if (!variantNode) {
    const suggestions = await fetchSuggestions({ type, rawCode, config });
    try {
      await logPriceCheckerEvent(supabase, {
        event_type: "lookup",
        lookup_type: type,
        query_value: rawCode,
        success: false,
        error_message: "No product found",
        user_agent: userAgent,
        ip_address: ip,
        meta: {
          suggestionsCount: suggestions.length
        }
      });
    } catch {}

    return Response.json(
      {
        ok: false,
        error: "No product found",
        suggestions
      },
      { status: 404 }
    );
  }

  const product = mapVariant(variantNode);
  try {
    await logPriceCheckerEvent(supabase, {
      event_type: "lookup",
      lookup_type: type,
      query_value: rawCode,
      success: true,
      error_message: null,
      user_agent: userAgent,
      ip_address: ip,
      product_id: product.productId,
      product_title: product.title
    });
  } catch {}

  return Response.json({ ok: true, product });
}
