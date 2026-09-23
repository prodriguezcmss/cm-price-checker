# CMSS quote email production setup

The customer-facing endpoint is `POST /api/cmss-quotes`. It recalculates every line through Shopify, stores the quote and two email jobs atomically, renders a numbered PDF, then sends the customer and CMSS copies through Resend. A five-minute cron retries temporary failures. Resend webhooks update delivery, delay, bounce, and complaint states.

## Required setup

1. Apply `supabase/migrations/202609230001_cmss_quote_delivery.sql` in the existing project. The migration creates only `cmss_*` quote tables and functions. It enables row-level security, revokes `anon` and `authenticated`, and grants access only to the server-side `service_role`.
2. Add these Vercel server variables to Preview first: `CMSS_QUOTE_RESEND_API_KEY`, `CMSS_QUOTE_RESEND_WEBHOOK_SECRET`, `CMSS_QUOTE_RATE_LIMIT_SALT`, and `CRON_SECRET`. Keep the existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SHOPIFY_SHOP`, and `SHOPIFY_ACCESS_TOKEN` server-only.
3. Confirm the Shopify app token has `write_draft_orders`, which is required for `draftOrderCalculate`, and set `SHOPIFY_API_VERSION=2026-07`.
4. Point a Resend webhook at `/api/cmss-quotes/webhook` for delivered, delayed, bounced, and complained events.
5. Schedule `/api/cmss-quotes/worker` at least every 10 minutes with `Authorization: Bearer $CRON_SECRET`. The current Vercel account plan must be checked before adding a Vercel cron because Hobby deployments reject schedules that run more than daily.
6. Integrate the unpublished theme cart with the Preview endpoint and complete one approved end-to-end test before promoting these variables to Production.

## Storefront request

Send JSON with contact fields, USD, the expected merchandise subtotal in cents, discount codes, and 1–100 cart lines containing numeric Shopify variant IDs and integer quantities. Send a random 20–100 character `Idempotency-Key` header and reuse it for retries of the same customer action. Include an empty `website` honeypot field.

The endpoint accepts browser requests only from `shopcmss.com`, `www.shopcmss.com`, and `shopcmss.myshopify.com`. It limits request size to 64 KB, applies a persistent hashed-IP rate limit, ignores browser-supplied titles and prices, and returns HTTP 409 when Shopify's current subtotal differs from the customer's reviewed subtotal.

## Verification

- `npm test`
- `npm run build`
- Verify a duplicate request returns the original quote number and does not create or send duplicate jobs.
- Verify the customer and `shop@cmschoolsupply.com` each receive one PDF.
- Verify Resend marks both jobs delivered.
- Run `supabase test db` when the repository is linked to a local Supabase test environment; `supabase/tests/cmss_quote_security.sql` checks RLS and role grants.
- Verify the theme remains unpublished and Vify remains available until the replacement passes acceptance testing.
