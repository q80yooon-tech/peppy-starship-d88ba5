
import {
  json,
  required,
  paypalBase,
  paypalAccessToken,
  supabaseAdmin,
} from './_shared.mjs';

function getHeader(headers, name) {
  const key = Object.keys(headers || {}).find(
    (item) => item.toLowerCase() === name.toLowerCase()
  );

  return key ? headers[key] : null;
}

function getSubscriptionId(resource) {
  const candidates = [
    resource.id,
    resource.billing_agreement_id,
    resource.subscription_id,
    resource.supplementary_data?.related_ids?.subscription_id,
  ];

  return candidates.find(
    (value) =>
      typeof value === 'string' &&
      /^I-[A-Z0-9]+$/i.test(value)
  ) || null;
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, {
      error: 'Method not allowed',
    });
  }

  try {
    // 1. Read and validate the incoming PayPal event
    const body = JSON.parse(event.body || '{}');

    const eventId = body.id;
    const eventType = body.event_type;

    if (
      typeof eventId !== 'string' ||
      !eventId ||
      typeof eventType !== 'string' ||
      !eventType
    ) {
      return json(400, {
        error: 'Invalid webhook event.',
      });
    }

    // 2. Verify PayPal webhook signature
    const webhookId = required('PAYPAL_WEBHOOK_ID');
    const token = await paypalAccessToken();
    const headers = event.headers || {};

    const verificationPayload = {
      auth_algo: getHeader(headers, 'paypal-auth-algo'),
      cert_url: getHeader(headers, 'paypal-cert-url'),
      transmission_id: getHeader(headers, 'paypal-transmission-id'),
      transmission_sig: getHeader(headers, 'paypal-transmission-sig'),
      transmission_time: getHeader(headers, 'paypal-transmission-time'),
      webhook_id: webhookId,
      webhook_event: body,
    };

    if (
      !verificationPayload.auth_algo ||
      !verificationPayload.cert_url ||
      !verificationPayload.transmission_id ||
      !verificationPayload.transmission_sig ||
      !verificationPayload.transmission_time
    ) {
      return json(400, {
        error: 'Missing PayPal signature headers.',
      });
    }

    const verificationResponse = await fetch(
      `${paypalBase()}/v1/notifications/verify-webhook-signature`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(verificationPayload),
      }
    );

    const verificationData = await verificationResponse.json();

    if (
      !verificationResponse.ok ||
      verificationData.verification_status !== 'SUCCESS'
    ) {
      return json(400, {
        error: 'Webhook signature verification failed.',
      });
    }

    // 3. Map supported PayPal subscription events
    const statusMap = {
      'BILLING.SUBSCRIPTION.ACTIVATED': 'active',
      'BILLING.SUBSCRIPTION.RE-ACTIVATED': 'active',
      'BILLING.SUBSCRIPTION.SUSPENDED': 'suspended',
      'BILLING.SUBSCRIPTION.CANCELLED': 'cancelled',
      'BILLING.SUBSCRIPTION.EXPIRED': 'expired',
      'BILLING.SUBSCRIPTION.PAYMENT.FAILED': 'past_due',
      'PAYMENT.SALE.DENIED': 'past_due',
    };

    const nextStatus = statusMap[eventType] || null;
    const resource = body.resource || {};
    const subscriptionId = getSubscriptionId(resource);

    // 4. Update the matching subscription before recording the event.
    // This allows PayPal retries if the database update fails.
    if (nextStatus && subscriptionId) {
      const updated = await supabaseAdmin(
        `membership_subscriptions?paypal_subscription_id=eq.${encodeURIComponent(subscriptionId)}`,
        {
          method: 'PATCH',
          headers: {
            Prefer: 'return=representation',
          },
          body: JSON.stringify({
            status: nextStatus,
            updated_at: new Date().toISOString(),
          }),
        }
      );

      if (!Array.isArray(updated) || updated.length === 0) {
        return json(500, {
          error: 'No matching subscription was found in Supabase.',
          event_type: eventType,
          subscription_id: subscriptionId,
        });
      }
    }

    // 5. Record the event after successful processing.
    // Duplicate deliveries are safe because status updates are idempotent.
    try {
      await supabaseAdmin('paypal_webhook_events', {
        method: 'POST',
        headers: {
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          paypal_event_id: eventId,
          event_type: eventType,
        }),
      });
    } catch (error) {
      const errorMessage = String(error.message || error);

      if (
        errorMessage.includes('409') ||
        errorMessage.toLowerCase().includes('duplicate key')
      ) {
        return json(200, {
          received: true,
          duplicate: true,
        });
      }

      throw error;
    }

    // 6. Acknowledge successful processing
    return json(200, {
      received: true,
      processed: true,
      event_type: eventType,
      subscription_updated: Boolean(nextStatus && subscriptionId),
      status: nextStatus,
    });

  } catch (error) {
    return json(500, {
      error: error.message || 'Webhook processing failed.',
    });
  }
};
