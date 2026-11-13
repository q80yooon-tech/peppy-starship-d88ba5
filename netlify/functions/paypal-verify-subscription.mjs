
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
    // 1. Verify signed-in user
    const user = await supabaseUserFromRequest(event);

    if (!user?.id) {
      return json(401, {
        error: 'Please sign in first.',
      });
    }

    // 2. Validate subscription ID
    const payload = JSON.parse(event.body || '{}');
    const subscriptionId =
      typeof payload.subscription_id === 'string'
        ? payload.subscription_id.trim()
        : '';

    if (!/^I-[A-Z0-9]+$/i.test(subscriptionId)) {
      return json(400, {
        error: 'Invalid PayPal subscription ID.',
      });
    }

    // 3. Get PayPal access token
    const token = await paypalAccessToken();

    // 4. Fetch subscription directly from PayPal
    const response = await fetch(
      `${paypalBase()}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`,
      {
        method: 'GET',
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

    // 5. Confirm returned subscription ID
    if (subscription.id !== subscriptionId) {
      return json(403, {
        error: 'PayPal returned a different subscription ID.',
      });
    }

    // 6. Confirm subscription belongs to signed-in user
    const paypalCustomId = String(subscription.custom_id || '');

    if (paypalCustomId !== user.id) {
      return json(403, {
        error: 'This subscription does not belong to the signed-in account.',
        custom_id_present: Boolean(paypalCustomId),
      });
    }

    // 7. Match the configured PayPal plan
    const plusPlan = required('PAYPAL_PLAN_PLUS').trim();
    const proPlan = required('PAYPAL_PLAN_PRO').trim();

    const actualPlanId = String(subscription.plan_id || '').trim();

    let tier = null;

    if (actualPlanId === plusPlan) {
      tier = 'plus';
    } else if (actualPlanId === proPlan) {
      tier = 'pro';
    }

    if (!tier) {
      return json(403, {
        error: 'This PayPal plan is not configured for Pink PDF Plus.',
        plan_matches: false,
      });
    }

    // 8. Map PayPal status safely
    const statusMap = {
      ACTIVE: 'active',
      APPROVAL_PENDING: 'pending',
      APPROVED: 'pending',
      SUSPENDED: 'suspended',
      CANCELLED: 'cancelled',
      EXPIRED: 'expired',
    };

    const paypalStatus = String(
      subscription.status || 'UNKNOWN'
    ).toUpperCase();

    const status = statusMap[paypalStatus];

    if (!status) {
      return json(502, {
        error: 'PayPal returned an unrecognized subscription status.',
        paypal_status: paypalStatus,
      });
    }

    // 9. Update the existing user's subscription record
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
          payer_email:
            subscription.subscriber?.email_address || null,
          updated_at: new Date().toISOString(),
        }),
      }
    );

    if (!Array.isArray(update) || update.length === 0) {
      return json(404, {
        error: 'Subscription record was not found in Supabase.',
        subscription_found: true,
        paypal_status: paypalStatus,
        matched_tier: tier,
      });
    }

    // 10. Return verified result
    return json(200, {
      success: true,
      subscription_id: subscriptionId,
      tier,
      status,
      paypal_status: paypalStatus,
      database_updated: true,
      membership_active: status === 'active',
    });

  } catch (error) {
    return json(500, {
      error: error.message || 'Subscription verification failed.',
    });
  }
};
