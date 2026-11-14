# Pink PDF Plus — plan limits (Deploy Preview only)

This patch adds client-side plan limits for browser-local processing and a server endpoint that resolves the signed-in user's latest subscription.

## Limits
- FREE: 10 MB per file; 3 files per operation.
- PLUS: 50 MB per file; 10 files per operation.
- PRO: 100 MB per file; 50 files per operation.

All existing core tools remain accessible on FREE. PLUS/PRO raise file-size and batch limits.

## Netlify environment
No new environment variables are required. The new `membership-status` function uses the existing `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and server-only `SUPABASE_SECRET_KEY`.

## Important limitation
Files remain in the visitor's browser and are never uploaded for processing. These limits are enforced in the browser UI; because the processing itself is client-side, a technically advanced visitor could modify browser code to bypass them. They are suitable as product-tier UX limits, not as a server-enforced quota or security boundary. A tamper-resistant daily quota would require a server-side usage ledger and additional database logic, which is not included in this patch.

## Deploy
Deploy only the `membership-dev` branch / Deploy Preview. Do not merge to `main` or use Live PayPal credentials during testing.
