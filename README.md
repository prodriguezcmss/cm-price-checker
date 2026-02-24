# CM School Supply Price Checker

Mobile-friendly in-store price checker for `shopcmss.com`, built with Next.js and Shopify Admin API.

## What this includes

- `GET /price-checker` customer-facing page
- Camera barcode scanning (when browser supports `BarcodeDetector`)
- Camera scanning fallback with ZXing for unsupported devices
- SKU manual entry fallback
- `GET /api/price-checker?barcode=...` and `GET /api/price-checker?sku=...`
- `POST /api/analytics/track` for custom usage events
- `GET /api/analytics/price-checker?hours=24` analytics summary endpoint
- `GET /analytics/price-checker` internal dashboard
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

## Analytics storage (Supabase)

To enable analytics events and dashboard, configure:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Create the table:

```sql
create table if not exists price_checker_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  event_type text not null,
  lookup_type text,
  query_value text,
  success boolean,
  error_message text,
  product_id text,
  product_title text,
  user_agent text,
  ip_address text,
  meta jsonb default '{}'::jsonb
);

create index if not exists price_checker_events_created_at_idx
  on price_checker_events (created_at desc);
```

Analytics dashboard:

- `https://your-domain/analytics/price-checker`

## Rate limiting

The app includes lightweight in-memory per-IP protection:

- `GET /api/price-checker`: `30` requests per `60` seconds
- `POST /api/analytics/track`: `60` requests per `60` seconds

When exceeded, endpoints return `429` with a `Retry-After` header.

## Branding assets

Place your logo at:

- `public/cm-logo.png`

If the file is missing, the page falls back to a text wordmark.

## QR code target

Use this URL in your in-store QR code:

- `https://shopcmss.com/price-checker`

## POS handoff (phase 1 pilot-ready)

This release includes cart handoff foundations plus customer list UI behind a feature flag.
Public behavior is unchanged while disabled.

Feature flag controls:

- `POS_HANDOFF_ENABLED=false` (default, disabled; enable only for Riverside pilot)
- `POS_HANDOFF_ALLOWED_STORE_ID=riverside`
- `POS_HANDOFF_EXPIRY_MINUTES=60`

API endpoints (only active when enabled):

- `GET /api/pos-handoff/config`
- `POST /api/pos-handoff/create`
- `GET /api/pos-handoff/retrieve?code=ABC123&storeId=riverside`
- `POST /api/pos-handoff/claim`

Staff portal (phase 2):

- `/staff/pos-handoff`
- `POST /api/staff/auth/login`
- `POST /api/staff/auth/logout`
- `GET /api/staff/auth/session`

Staff auth env vars:

- `STAFF_AUTH_SECRET` (long random string)
- `STAFF_LOGIN_EMAIL`
- `STAFF_LOGIN_PASSWORD`

Create the handoff table in Supabase:

```sql
create table if not exists pos_handoffs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  handoff_code text not null unique,
  store_id text not null,
  status text not null check (status in ('open', 'claimed', 'expired')),
  expires_at timestamp with time zone not null,
  claimed_at timestamp with time zone,
  claimed_by_staff_user_id text,
  customer_session_id text,
  source text,
  items jsonb not null default '[]'::jsonb
);

create index if not exists pos_handoffs_store_status_idx
  on pos_handoffs (store_id, status);

create index if not exists pos_handoffs_expires_at_idx
  on pos_handoffs (expires_at);
```
