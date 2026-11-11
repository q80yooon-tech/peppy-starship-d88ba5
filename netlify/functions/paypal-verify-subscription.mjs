import { json, required, paypalBase, paypalAccessToken, supabaseUserFromRequest, supabaseAdmin } from './_shared.mjs';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const user = await supabaseUserFromRequest(event);
    if (!user?.id) return json(401, { error: 'Please sign in first.' });
    const { subscription_id: subscriptionId } = JSON.parse(event.body || '{}');
    if (typeof subscriptionId !== 'string' || !/^I-[A-Z0-9]+$/i.test(subscriptionId)) {
      return json(400, { error: 'Invalid PayPal subscription ID.' });
    }
    const token = await paypalAccessToken();
    const response = await fetch(`${paypalBase()}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    });
    const subscription = await response.json();
    if (!response.ok) return json(502, { error: 'Could not verify the PayPal subscription.' });
    if (subscription.custom_id !== user.id) return json(403, { error: 'This subscription does not belong to the signed-in account.' });
    const plusPlan = required('PAYPAL_PLAN_PLUS');
    const proPlan = required('PAYPAL_PLAN_PRO');
    const tier = subscription.plan_id === plusPlan ? 'plus' : subscription.plan_id === proPlan ? 'pro' : null;
    if (!tier) return json(403, { error: 'This PayPal plan is not configured for Pink PDF Plus.' });
    const statusMap = { ACTIVE: 'active', SUSPENDED: 'suspended', CANCELLED: 'cancelled', EXPIRED: 'expired', APPROVAL_PENDING: 'pending' };
    const status = statusMap[subscription.status] || 'pending';
    const update = await supabaseAdmin(
      `membership_subscriptions?paypal_subscription_id=eq.${encodeURIComponent(subscriptionId)}&user_id=eq.${encodeURIComponent(user.id)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          tier, paypal_plan_id: subscription.plan_id, status,
          payer_email: subscription.subscriber?.email_address || null,
          updated_at: new Date().toISOString(),
        }),
      }
    );
    if (!Array.isArray(update) || update.length === 0) return json(404, { error: 'Pending subscription record was not found. Please contact support before trying again.' });
    return json(200, { tier, status });
  } catch (error) { return json(500, { error: error.message || 'Subscription verification failed.' }); }
};
