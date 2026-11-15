# Pink PDF Plus — Account & Sign-in patch

This is a **small patch**, not a full website archive. It intentionally excludes all unrelated tool pages and all `index (n).html` files, so no duplicate homepage copies are uploaded.

## Files in this patch
- `index.html` — updated homepage with Account links in desktop and mobile navigation.
- `account.html` — sign-in, account creation, password reset, and account state page.
- `account.js` — Supabase Auth browser logic. It obtains only the public URL and publishable key from the Netlify function; no secret key is exposed to the browser.
- `netlify/functions/public-config.mjs` — public configuration endpoint used by the account page.

## Before using the patch
1. Upload these files only to the `membership-dev` branch.
2. Preserve the paths exactly. The function must be at `netlify/functions/public-config.mjs`.
3. Do not merge the pull request into `main` yet.
4. In Supabase Authentication URL Configuration, add the Deploy Preview URL to the allowed redirect URLs. Also set the Site URL appropriately for the production domain later.
5. Email confirmation must be enabled in Supabase Auth. Test signup, email confirmation, sign-in, password reset, and sign-out in the Deploy Preview.

## Important scope
This patch implements the account/authentication interface only. It does not yet add subscription purchase buttons, paid-feature enforcement, subscription management UI, or production-ready webhook reconciliation. Those require separate implementation and testing before launch.
