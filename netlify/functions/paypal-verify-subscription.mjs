
import {
  json,
  required,
  paypalBase,
  paypalAccessToken,
  supabaseUserFromRequest,
  supabaseAdmin,
} from './_shared.mjs';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  try {
    const user = await supabaseUserFromRequest(event);

    if (!user?.id) {
      return json(401, { error: 'Please sign in first.' });
    }

    const payload = JSON.parse(event.body || '{}');
    const subscriptionId = payload.subscription_id;

    if (
      typeof subscriptionId !== 'string' ||
      !/^I-[A-Z0-9]+$/i.test(subscriptionId)
    ) {
      return json(400, { error: 'Invalid PayPal subscription ID.' });
    }

    const token = await paypalAccessToken();

    const response = await fetch(
      `${paypalBase()}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
        },
      }
    );

    const subscription = await response.json();

    if (!response.ok) {
      return json(502, {
        error: 'Could not verify the PayPal subscription.',
        paypal_status_code: response.status,
        paypal_error: subscription,
      });
    }

    const paypalCustomId = String(subscription.custom_id || '');
    const customIdMatches = paypalCustomId === user.id;

    const plusPlan = required('PAYPAL_PLAN_PLUS').trim();
    const proPlan = required('PAYPAL_PLAN_PRO').trim();
    const actualPlanId = String(subscription.plan_id || '').trim();

    const tier =
      actualPlanId === plusPlan ? 'plus' :
      actualPlanId === proPlan ? 'pro' : null;

    const diagnostic = {
      diagnostic: true,
      subscription_found: true,
      custom_id_present: Boolean(paypalCustomId),
      custom_id_matches_signed_in_user: customIdMatches,
      paypal_status: subscription.status || 'UNKNOWN',
      plan_matches: Boolean(tier),
      matched_tier: tier,
    };

    if (!customIdMatches || !tier) {
      return json(403, {
        error: 'PayPal subscription verification mismatch.',
        ...diagnostic,
      });
    }

    const statusMap = {
      ACTIVE: 'active',
      SUSPENDED: 'suspended',
      CANCELLED: 'cancelled',
      EXPIRED: 'expired',
      APPROVAL_PENDING: 'pending',
      APPROVED: 'pending',
    };

    const status =
      statusMap[subscription.status] || 'pending';

    const update = await supabaseAdmin(
      `membership_subscriptions?paypal_subscription_id=eq.${encodeURIComponent(subscriptionId)}&user_id=eq.${encodeURIComponent(user.id)}`,
      {
        method: 'PATCH',
        headers: {
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          tier,
          paypal_plan_id: actualPlanId,
          status,
          payer_email: subscription.subscriber?.email_address || null,
          updated_at: new Date().toISOString(),
        }),
      }
    );

    if (!Array.isArray(update) || update.length === 0) {
      return json(404, {
        error: 'Subscription record was not found in Supabase.',
        ...diagnostic,
      });
    }

    return json(200, {
      success: true,
      ...diagnostic,
      status,
      database_updated: true,
    });

  } catch (error) {
    return json(500, {
      error: error.message || 'Subscription verification failed.',
    });
  }
};
