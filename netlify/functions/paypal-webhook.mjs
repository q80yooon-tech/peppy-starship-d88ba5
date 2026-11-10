import {
  json, required, paypalBase, paypalAccessToken, supabaseAdmin,
} from "./_shared.mjs";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const webhookId = required("PAYPAL_WEBHOOK_ID");
    const token = await paypalAccessToken();
    const body = JSON.parse(event.body || "{}");
    const h = event.headers || {};

    const verification = await fetch(`${paypalBase()}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        auth_algo: h["paypal-auth-algo"],
        cert_url: h["paypal-cert-url"],
        transmission_id: h["paypal-transmission-id"],
        transmission_sig: h["paypal-transmission-sig"],
        transmission_time: h["paypal-transmission-time"],
        webhook_id: webhookId,
        webhook_event: body,
      }),
    });
    const verificationData = await verification.json();
    if (!verification.ok || verificationData.verification_status !== "SUCCESS") {
      return json(400, { error: "Webhook signature verification failed." });
    }

    const eventId = body.id;
    const eventType = body.event_type;
    if (!eventId || !eventType) return json(400, { error: "Invalid webhook event." });

    // Idempotency: duplicate PayPal deliveries are acknowledged without reprocessing.
    try {
      await supabaseAdmin("paypal_webhook_events", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ paypal_event_id: eventId, event_type: eventType }),
      });
    } catch (e) {
      if (String(e.message).includes("409")) return json(200, { received: true, duplicate: true });
      throw e;
    }

    const resource = body.resource || {};
    const subscriptionId =
      resource.id && String(resource.id).startsWith("I-") ? resource.id :
      resource.billing_agreement_id || resource.subscription_id;

    const statusMap = {
      "BILLING.SUBSCRIPTION.ACTIVATED": "active",
      "BILLING.SUBSCRIPTION.SUSPENDED": "suspended",
      "BILLING.SUBSCRIPTION.CANCELLED": "cancelled",
      "BILLING.SUBSCRIPTION.EXPIRED": "expired",
      "BILLING.SUBSCRIPTION.PAYMENT.FAILED": "past_due",
    };
    const nextStatus = statusMap[eventType];

    if (subscriptionId && nextStatus) {
      await supabaseAdmin(
        `membership_subscriptions?paypal_subscription_id=eq.${encodeURIComponent(subscriptionId)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            status: nextStatus,
            updated_at: new Date().toISOString(),
          }),
        }
      );
    }
    return json(200, { received: true });
  } catch (error) {
    return json(500, { error: error.message || "Webhook processing failed." });
  }
};
