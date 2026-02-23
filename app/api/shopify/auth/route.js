import { NextResponse } from "next/server";
import { generateState, isValidShop } from "@/lib/shopify-oauth";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const shop = searchParams.get("shop");

  if (!isValidShop(shop)) {
    return NextResponse.json({ ok: false, error: "Invalid shop" }, { status: 400 });
  }

  const apiKey = process.env.SHOPIFY_API_KEY;
  const scopes = process.env.SHOPIFY_SCOPES || "read_customers,read_companies";
  const appUrl = process.env.SHOPIFY_APP_URL;

  if (!apiKey || !appUrl) {
    return NextResponse.json(
      { ok: false, error: "Missing Shopify app config" },
      { status: 400 }
    );
  }

  const state = generateState();
  const redirectUri = `${appUrl}/api/shopify/callback`;
  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${apiKey}&scope=${encodeURIComponent(
    scopes
  )}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

  const response = NextResponse.redirect(installUrl);
  response.cookies.set("shopify_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: 60 * 5
  });

  return response;
}
