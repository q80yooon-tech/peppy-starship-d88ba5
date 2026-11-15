# Pink PDF Plus — membership integration foundation

This is a development scaffold only. It has not been deployed and does not activate payments.

## Included
- `supabase/membership-schema.sql`: subscription and webhook ledger tables with RLS.
- `netlify/functions/paypal-create-subscription.mjs`: authenticated subscription creation.
- `netlify/functions/paypal-webhook.mjs`: PayPal webhook signature verification and status updates.
- `netlify/functions/_shared.mjs`: server-only helpers.
- `.env.example`: names of Netlify environment variables; contains no credentials.

## Required setup before testing
1. Apply `supabase/membership-schema.sql` in the Supabase SQL Editor.
2. In Netlify, set environment variables from `.env.example`.
3. Use `PAYPAL_MODE=sandbox` and the Sandbox app credentials only.
4. Create PayPal Billing Plans for PLUS and PRO:
   - Billing cycle 1: trial, 3 monthly cycles, fixed price 50% of the standard tier.
   - Billing cycle 2: regular monthly price, infinite cycles.
   - Save the resulting plan IDs as `PAYPAL_PLAN_PLUS` and `PAYPAL_PLAN_PRO`.
5. Deploy only to a separate Netlify branch/deploy preview, then create the PayPal Sandbox webhook using:
   `https://<deploy-preview-domain>/.netlify/functions/paypal-webhook`
6. Save the webhook ID as `PAYPAL_WEBHOOK_ID`.

## Important caveats before production
- The existing static site has not been modified to add sign-in UI or invoke the subscription endpoint.
- Add and test a sign-in flow using Supabase Auth before exposing subscription buttons.
- The webhook handler must be extended and tested against actual Sandbox event payloads, especially payment failures, cancellation, and subscription updates.
- Add reconciliation by fetching subscription details from PayPal on webhook receipt; do not rely only on event payload status.
- Add event-ledger atomic idempotency handling before production. The current scaffold is a starting point, not a production-certified payment system.
- Do not use Live credentials until all Sandbox flows pass.
- Do not place `SUPABASE_SECRET_KEY` or `PAYPAL_CLIENT_SECRET` in browser code.
- This scaffold does not enforce paid-tool quotas; core file processing remains browser-side.
