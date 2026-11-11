import {
  json, required, paypalBase, paypalAccessToken,
  supabaseUserFromRequest, supabaseAdmin,
} from './_shared.mjs';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const user = await supabaseUserFromRequest(event);
    if (!user?.id) return json(401, { error: 'Please sign in first.' });
    const payload = JSON.parse(event.body || '{}');
    const tier = String(payload.tier || '').toLowerCase();
    if (!['plus', 'pro'].includes(tier)) return json(400, { error: 'Invalid membership tier.' });
    const planId = required(tier === 'plus' ? 'PAYPAL_PLAN_PLUS' : 'PAYPAL_PLAN_PRO');
    const token = await paypalAccessToken();
    const siteUrl = required('SITE_URL').replace(/\/$/, '');
    const response = await fetch(`${paypalBase()}/v1/billing/subscriptions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', prefer: 'return=representation' },
      body: JSON.stringify({
        plan_id: planId,
        custom_id: user.id,
        application_context: {
          brand_name: 'Pink PDF Plus',
          user_action: 'SUBSCRIBE_NOW',
          return_url: `${siteUrl}/subscription-success.html`,
          cancel_url: `${siteUrl}/account.html?subscription=cancelled`,
        },
      }),
    });
    const data = await response.json();
    if (!response.ok) return json(502, { error: 'PayPal could not create the subscription.', details: data });
    await supabaseAdmin('membership_subscriptions', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: user.id, paypal_subscription_id: data.id, paypal_plan_id: planId, tier, status: 'pending' }),
    });
    const approval = (data.links || []).find((link) => link.rel === 'approve');
    if (!approval?.href) return json(502, { error: 'PayPal approval link was not returned.' });
    return json(200, { approval_url: approval.href, subscription_id: data.id });
  } catch (error) { return json(500, { error: error.message || 'Unexpected server error.' }); }
};
