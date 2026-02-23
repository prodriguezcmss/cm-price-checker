import { getSupabaseServerClient } from "@/lib/supabase";
import { getShopifyConfig, shopifyGraphQL } from "@/lib/shopify";

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

async function resolveShopifyAdminConfig() {
  const shop = process.env.SHOPIFY_SHOP;
  let token = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!token && shop) {
    const supabase = getSupabaseServerClient();
    if (supabase) {
      const { data } = await supabase
        .from("shop_tokens")
        .select("access_token")
        .eq("shop", shop)
        .single();

      token = data?.access_token || null;
    }
  }

  return getShopifyConfig({ shop, token });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const barcode = sanitizeInput(searchParams.get("barcode"));
  const sku = sanitizeInput(searchParams.get("sku"));

  const type = barcode ? "barcode" : "sku";
  const rawCode = barcode || sku;

  if (!rawCode) {
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
    return Response.json(
      {
        ok: false,
        error: errors[0]?.message || "Shopify query failed"
      },
      { status: 502 }
    );
  }

  const variantNode = data?.productVariants?.edges?.[0]?.node;
  if (!variantNode) {
    return Response.json(
      {
        ok: false,
        error: "No product found"
      },
      { status: 404 }
    );
  }

  return Response.json({ ok: true, product: mapVariant(variantNode) });
}
