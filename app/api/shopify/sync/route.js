import { fetchCompanies, fetchCustomers, getShopifyConfig } from "@/lib/shopify";
import { getSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function normalizeCustomers(edges = []) {
  return edges.map((edge) => {
    const node = edge.node || {};
    return {
      id: node.id,
      firstName: node.firstName || "",
      lastName: node.lastName || "",
      email: node.email || "",
      phone: node.phone || "",
      createdAt: node.createdAt,
      updatedAt: node.updatedAt
    };
  });
}

function normalizeCompanies(edges = []) {
  return edges.map((edge) => {
    const node = edge.node || {};
    return {
      id: node.id,
      name: node.name || "",
      createdAt: node.createdAt,
      updatedAt: node.updatedAt
    };
  });
}

export async function POST() {
  let shop = String(process.env.SHOPIFY_SHOP || "").trim().toLowerCase();
  const supabase = getSupabaseServerClient();
  let token = String(process.env.SHOPIFY_ACCESS_TOKEN || "").trim();

  if ((!token || !shop) && supabase) {
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
      if (!shop) shop = String(row.shop || "").trim().toLowerCase();
      if (!token) token = String(row.access_token || "").trim();
    }
  }

  const config = getShopifyConfig({ shop: shop || null, token: token || null });
  if (!config) {
    return Response.json(
      { ok: false, error: "Missing Shopify credentials" },
      { status: 400 }
    );
  }

  const [customerResult, companyResult] = await Promise.all([
    fetchCustomers(50, config),
    fetchCompanies(50, config)
  ]);

  const customers = normalizeCustomers(
    customerResult?.data?.customers?.edges || []
  );
  const companies = normalizeCompanies(
    companyResult?.data?.companies?.edges || []
  );

  if (supabase) {
    await supabase.from("sync_logs").insert({
      source: "shopify",
      summary: `Customers: ${customers.length}, Companies: ${companies.length}`,
      payload: {
        customersCount: customers.length,
        companiesCount: companies.length,
        customerErrors: customerResult?.errors || null,
        companyErrors: companyResult?.errors || null
      }
    });
  }

  return Response.json({
    ok: true,
    customers,
    companies,
    errors: {
      customers: customerResult?.errors || null,
      companies: companyResult?.errors || null
    }
  });
}
