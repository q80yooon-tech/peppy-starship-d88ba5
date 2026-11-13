
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

    // 2. Read requested plan
    let payload;

    try {
      payload = JSON.parse(event.body || '{}');
    } catch {
      return json(400, {
        error: 'Invalid request body.',
      });
    }

    const tier = String(payload.tier || '').toLowerCase();

    if (!['plus', 'pro'].includes(tier)) {
      return json(400, {
        error: 'Please choose a valid membership plan.',
      });
    }

    // 3. Select PayPal plan ID
    const planId = required(
      tier === 'plus' ? 'PAYPAL_PLAN_PLUS' : 'PAYPAL_PLAN_PRO'
    ).trim();

    const siteUrl = required('SITE_URL').replace(/\/+$/, '');

    // 4. Get PayPal access token
    const token = await paypalAccessToken();

    // 5. Create subscription in PayPal
    const response = await fetch(
      `${paypalBase()}/v1/billing/subscriptions`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          accept: 'application/json',
          prefer: 'return=representation',
        },
        body: JSON.stringify({
          plan_id: planId,
          custom_id: user.id,
          application_context: {
            brand_name: 'Pink PDF Plus',
            locale: 'en-US',
            user_action: 'SUBSCRIBE_NOW',
            payment_method: {
              payer_selected: 'PAYPAL',
              payee_preferred: 'IMMEDIATE_PAYMENT_REQUIRED',
            },
            return_url:
              `${siteUrl}/account.html?subscription=success`,
            cancel_url:
              `${siteUrl}/account.html?subscription=cancelled`,
          },
        }),
      }
    );

    const paypalData = await response.json();

    if (!response.ok) {
      return json(502, {
        error: 'PayPal could not create the subscription.',
        paypal_status_code: response.status,
        paypal_error: paypalData,
      });
    }

    // 6. Validate PayPal response
    const subscriptionId = paypalData.id;

    if (
      typeof subscriptionId !== 'string' ||
      !/^I-[A-Z0-9]+$/i.test(subscriptionId)
    ) {
      return json(502, {
        error: 'PayPal returned an invalid subscription ID.',
      });
    }

    const approvalLink = (paypalData.links || []).find(
      (link) =>
        link.rel === 'approve' &&
        link.method === 'GET'
    );

    if (!approvalLink?.href) {
      return json(502, {
        error: 'PayPal did not return an approval URL.',
      });
    }

    // 7. Save pending subscription in Supabase Test
    await supabaseAdmin('membership_subscriptions', {
      method: 'POST',
      headers: {
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        user_id: user.id,
        paypal_subscription_id: subscriptionId,
        paypal_plan_id: planId,
        tier,
        status: 'pending',
      }),
    });

    // 8. Send approval URL to account.js
    return json(200, {
      success: true,
      tier,
      subscription_id: subscriptionId,
      approval_url: approvalLink.href,
      status: 'pending',
    });

  } catch (error) {
    return json(500, {
      error:
        error.message ||
        'Could not create PayPal subscription.',
    });
  }
};
