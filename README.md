# CM School Supply Price Checker

Mobile-friendly in-store price checker for `shopcmss.com`, built with Next.js and Shopify Admin API.

## What this includes

- `GET /price-checker` customer-facing page
- Camera barcode scanning (when browser supports `BarcodeDetector`)
- SKU manual entry fallback
- `GET /api/price-checker?barcode=...` and `GET /api/price-checker?sku=...`
- Branded UI with:
  - Main color `#1f3e5d`
  - Secondary color `#af2230`

## Quick start

1. Install dependencies: `npm install`
2. Copy env file: `cp .env.example .env`
3. Fill required Shopify values in `.env`:
   - `SHOPIFY_SHOP`
   - `SHOPIFY_ACCESS_TOKEN`
   - Optional OAuth values if you want token install flow
4. Start dev server: `npm run dev`
5. Open:
   - App landing: `http://localhost:3000`
   - Price checker: `http://localhost:3000/price-checker`

## Shopify requirements

- Admin API token with at least `read_products`
- If using OAuth install flow, set:
  - `SHOPIFY_APP_URL`
  - `SHOPIFY_API_KEY`
  - `SHOPIFY_API_SECRET`
  - `SHOPIFY_SCOPES` including `read_products`

## Branding assets

Place your logo at:

- `public/cm-logo.png`

If the file is missing, the page falls back to a text wordmark.

## QR code target

Use this URL in your in-store QR code:

- `https://shopcmss.com/price-checker`
