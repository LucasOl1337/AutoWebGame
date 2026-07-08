# Billing checkout readiness

This is the current controlled-sales billing contract. It prepares checkout and paid access without binding the game to a specific payment provider.

## Worker env vars

- `BILLING_CHECKOUT_URL`: external checkout or payment-link URL. When present, the landing shows checkout as available.
- `BILLING_WEBHOOK_SECRET`: shared secret required by `/api/billing/webhook`.

Do not configure these against a live provider without a human release decision.

## Public endpoints

- `GET /api/billing/status`
  - Returns `{ billing }`.
  - Visitors get `accessLevel: "visitor"`.
  - Logged-in free accounts get `accessLevel: "free"`.
  - Confirmed accounts get `accessLevel: "paid"` and `checkoutState: "confirmed"`.

- `POST /api/billing/checkout`
  - Requires the existing quick account cookie.
  - Returns `401` when the visitor has not created an account.
  - Returns `503` when `BILLING_CHECKOUT_URL` is missing.
  - Stores a pending billing record and returns a checkout URL with `account_id`, `username`, `checkout_id`, `client_reference_id`, and `return_url` query parameters.

- `POST /api/billing/webhook`
  - Requires `x-billing-webhook-secret` or `Authorization: Bearer <secret>`.
  - Accepts `event` or `type` equal to `checkout.confirmed` or `payment.succeeded`.
  - Reads the account from `accountId`, `account_id`, or `client_reference_id`.
  - Optional provider reference may be sent as `providerSessionId`, `provider_session_id`, `checkout_id`, `sessionId`, or `id`.

Example confirmation payload:

```json
{
  "event": "checkout.confirmed",
  "accountId": "acct_example",
  "providerSessionId": "checkout_session_example"
}
```
