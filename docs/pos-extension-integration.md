# POS Extension Integration Plan

This document defines how the Shopify POS tile should import customer handoff lists into the active cart.

## Endpoint to use

`POST /api/pos-handoff/claim-pos`

Request body:

```json
{
  "code": "ABC123",
  "storeId": "riverside",
  "staffId": "riverside1",
  "pin": "4155"
}
```

Response on success:

```json
{
  "ok": true,
  "handoff": {
    "id": "...",
    "code": "ABC123",
    "storeId": "riverside",
    "status": "claimed",
    "claimedAt": "2026-02-24T18:00:00.000Z",
    "items": [
      {
        "variantId": "gid://shopify/ProductVariant/32049687920714",
        "sku": "TCR7932",
        "title": "Home Sweet Classroom Today Chart(C)",
        "quantity": 1
      }
    ],
    "cartLines": [
      {
        "variantId": "gid://shopify/ProductVariant/32049687920714",
        "variantNumericId": 32049687920714,
        "quantity": 1,
        "sku": "TCR7932",
        "title": "Home Sweet Classroom Today Chart(C)",
        "barcode": "088231979326"
      }
    ]
  }
}
```

## POS tile behavior

1. Staff enters `code`, `staffId`, `pin`.
2. Tile calls `claim-pos` endpoint.
3. For each `cartLine`, call POS cart add-line-item API using `variantNumericId` and `quantity`.
4. Show success summary in tile and keep checkout in normal POS flow.

## Error handling

- `401 Unauthorized`: wrong staff ID/PIN.
- `404 Handoff not found`: invalid or mistyped code.
- `409 Handoff is claimed/expired`: code already used.
- `410 Handoff has expired`: code timed out.
- `429 Too many requests`: short cooldown.

## Security notes

- Keep `pin` entry inside staff-only POS tile UI.
- Never expose `STAFF_LOGIN_PIN` client-side outside staff flow.
- `claim-pos` is one-time claim and writes `claimed_by_staff_user_id`.
