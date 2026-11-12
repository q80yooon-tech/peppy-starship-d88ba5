
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

    const configuredPlanId = required(
      tier === 'plus' ? 'PAYPAL_PLAN_PLUS' : 'PAYPAL_PLAN_PRO'
    ).trim();

    const token = await paypalAccessToken();

    const response = await fetch(
      `${paypalBase()}/v1/billing/plans?page_size=20&total_required=true`,
      {
        method: 'GET',
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return json(502, {
        diagnostic: true,
        list_check_ok: false,
        status: response.status,
        paypal_error: data,
      });
    }

    const plans = (data.plans || []).map((plan) => ({
      id: plan.id,
      name: plan.name,
      status: plan.status,
    }));

    return json(200, {
      diagnostic: true,
      list_check_ok: true,
      selected_tier: tier,
      configured_plan_id: configuredPlanId,
      configured_plan_found: plans.some(
        (plan) => plan.id === configuredPlanId
      ),
      plans,
      total_items: data.total_items || null,
      total_pages: data.total_pages || null,
    });

  } catch (error) {
    return json(500, {
      error: error.message || 'Unexpected server error.',
    });
  }
};
