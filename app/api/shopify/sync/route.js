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
  const shop = process.env.SHOPIFY_SHOP;
  const supabase = getSupabaseServerClient();
  let token = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!token && supabase && shop) {
    const { data } = await supabase
      .from("shop_tokens")
      .select("access_token")
      .eq("shop", shop)
      .single();
    token = data?.access_token || null;
  }

  const config = getShopifyConfig({ shop, token });
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
