const DEFAULT_VERSION = "2024-10";

export function getShopifyConfig({ shop, token } = {}) {
  const resolvedShop = shop || process.env.SHOPIFY_SHOP;
  const resolvedToken = token || process.env.SHOPIFY_ACCESS_TOKEN;
  const version = process.env.SHOPIFY_API_VERSION || DEFAULT_VERSION;

  if (!resolvedShop || !resolvedToken) return null;
  return { shop: resolvedShop, token: resolvedToken, version };
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
