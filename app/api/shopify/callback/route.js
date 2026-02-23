import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { isValidShop, verifyHmac } from "@/lib/shopify-oauth";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!isValidShop(shop)) {
    return NextResponse.json({ ok: false, error: "Invalid shop" }, { status: 400 });
  }

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "Missing Shopify secret" },
      { status: 400 }
    );
  }

  const cookieState = request.cookies.get("shopify_oauth_state")?.value;
  if (!cookieState || cookieState !== state) {
    return NextResponse.json(
      { ok: false, error: "Invalid OAuth state" },
      { status: 400 }
    );
  }

  if (!verifyHmac(url.searchParams.toString(), secret)) {
    return NextResponse.json(
      { ok: false, error: "HMAC validation failed" },
      { status: 400 }
    );
  }

  if (!code) {
    return NextResponse.json({ ok: false, error: "Missing code" }, { status: 400 });
  }

  const apiKey = process.env.SHOPIFY_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Missing Shopify API key" },
      { status: 400 }
    );
  }

  const tokenResponse = await fetch(
    `https://${shop}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: apiKey,
        client_secret: secret,
        code
      })
    }
  );

  const tokenJson = await tokenResponse.json();
  const accessToken = tokenJson?.access_token;
  const scope = tokenJson?.scope || null;

  if (!accessToken) {
    return NextResponse.json(
      { ok: false, error: "Failed to retrieve access token", details: tokenJson },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      {
        ok: true,
        warning: "Token retrieved but not stored (Supabase not configured)",
        shop,
        accessToken
      },
      { status: 200 }
    );
  }

  await supabase.from("shop_tokens").upsert({
    shop,
    access_token: accessToken,
    scope,
    installed_at: new Date().toISOString()
  });

  const response = NextResponse.json({ ok: true, shop, scope });
  response.cookies.delete("shopify_oauth_state");
  return response;
}
