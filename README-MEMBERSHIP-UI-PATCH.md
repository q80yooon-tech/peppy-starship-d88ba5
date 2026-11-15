# Pink PDF Plus — PLUS / PRO Sandbox UI patch

Development-only patch for the `membership-dev` branch. It adds subscription choices to the signed-in account page and verifies the PayPal return server-side. It is not a production launch package.

## Files (6)
- `account.html` — membership choices after sign-in.
- `account.js` — calls the authenticated Netlify function and displays subscription status via Supabase RLS.
- `netlify/functions/paypal-create-subscription.mjs` — creates a PayPal Sandbox subscription and returns the approval URL.
- `netlify/functions/paypal-verify-subscription.mjs` — new authenticated endpoint; verifies the subscription directly with PayPal and reconciles the pending database row.
- `subscription-success.html` — PayPal return page; checks the subscription with the server before showing active status.
- `README-MEMBERSHIP-UI-PATCH.md` — this file.

`netlify/functions/_shared.mjs`, `paypal-webhook.mjs`, `public-config.mjs`, `netlify.toml`, and the SQL schema are not replaced by this patch; they should already exist in `membership-dev`.

## Upload instructions
Upload only the five application files (not this README if you prefer) into the exact paths on the `membership-dev` branch. Do not upload to `main`, merge the pull request, or press Publish deploy. After the commit, wait for the Deploy Preview build to succeed.

## Required existing Netlify environment variables
`PAYPAL_MODE=sandbox`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_PLAN_PLUS`, `PAYPAL_PLAN_PRO`, `PAYPAL_WEBHOOK_ID`, `SITE_URL` (Deploy Previews value must be the public Deploy Preview base URL), `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY`. Never place secrets in browser code or share them in chat.

## Important test notes
- Use a PayPal Sandbox personal/buyer account to approve the subscription. Do not use a real PayPal account or live credentials.
- This patch verifies the subscription by querying PayPal after return. The webhook remains responsible for asynchronous status updates.
- Confirm the webhook is registered against the current Deploy Preview function URL and that the PayPal webhook ID in Netlify belongs to the same Sandbox app.
- Before production, separately review webhook idempotency, cancellation handling, subscription renewal/payment-failure handling, support/refund flows, and paid-feature authorization. Do not expose paid features based only on a browser redirect.
