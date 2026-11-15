
import {
  json,
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

    const { subscription_id: subscriptionId } =
      JSON.parse(event.body || '{}');

    if (
      typeof subscriptionId !== 'string' ||
      !/^I-[A-Z0-9]+$/i.test(subscriptionId)
    ) {
      return json(400, { error: 'Invalid subscription ID.' });
    }

    const token = await paypalAccessToken();

    const base = paypalBase();

    const checkResponse = await fetch(
      `${base}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
        },
      }
    );

    const subscription = await checkResponse.json();

    if (!checkResponse.ok) {
      return json(502, {
        error: 'Could not find the subscription in PayPal.',
        paypal_status_code: checkResponse.status,
        details: subscription,
      });
    }

    if (subscription.custom_id !== user.id) {
      return json(403, {
        error: 'Subscription does not belong to this account.',
      });
    }

    const cancelResponse = await fetch(
      `${base}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          reason: 'Replacing the pending Pink PDF Plus test subscription.',
        }),
      }
    );

    if (!cancelResponse.ok) {
      const details = await cancelResponse.text();
      return json(502, {
        error: 'PayPal could not cancel this subscription.',
        paypal_status_code: cancelResponse.status,
        details,
      });
    }

    await supabaseAdmin(
      `membership_subscriptions?paypal_subscription_id=eq.${encodeURIComponent(subscriptionId)}&user_id=eq.${encodeURIComponent(user.id)}`,
      {
        method: 'PATCH',
        headers: {
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        }),
      }
    );

    return json(200, {
      success: true,
      subscription_id: subscriptionId,
      status: 'cancelled',
    });

  } catch (error) {
    return json(500, {
      error: error.message || 'Cancellation failed.',
    });
  }
};
