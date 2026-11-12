
import {
  json, required, paypalBase, paypalAccessToken,
  supabaseUserFromRequest,
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
    const tier = String(payload.tier || '').toLowerCase();

    if (!['plus', 'pro'].includes(tier)) {
      return json(400, { error: 'Invalid membership tier.' });
    }

    const planId = required(
      tier === 'plus' ? 'PAYPAL_PLAN_PLUS' : 'PAYPAL_PLAN_PRO'
    ).trim();

    const token = await paypalAccessToken();

    // Temporary diagnostic: retrieve the plan without creating a subscription.
    const checkResponse = await fetch(
      `${paypalBase()}/v1/billing/plans/${encodeURIComponent(planId)}`,
      {
        method: 'GET',
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
        },
      }
    );

    const plan = await checkResponse.json();

    return json(checkResponse.ok ? 200 : 502, {
      diagnostic: true,
      plan_check_ok: checkResponse.ok,
      plan_check_status: checkResponse.status,
      configured_plan_id_matches: plan.id === planId,
      plan_status: plan.status || null,
      paypal_error: checkResponse.ok ? null : plan,
    });

  } catch (error) {
    return json(500, {
      error: error.message || 'Unexpected server error.',
    });
  }
};
