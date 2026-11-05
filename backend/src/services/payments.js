
import crypto from 'node:crypto';
import { ValidationError, ConfigError } from './validators.js';

export function verifyRazorpaySignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    throw new ConfigError('RAZORPAY_WEBHOOK_SECRET is not configured on the server.');
  }
  if (!signature || typeof signature !== 'string') {
    throw new ValidationError('Missing Razorpay webhook signature header.');
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(signature, 'utf8');
  if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
    throw new ValidationError('Razorpay webhook signature mismatch.', 401);
  }
  return true;
}

export function parseRazorpayEvent(payload) {
  const event = String(payload?.event ?? '').trim();
  const entity = payload?.payload?.payment?.entity ?? null;
        let status = 'ignored';
  if (event === 'payment.captured' || event === 'order.paid') status = 'captured';
  else if (event === 'payment.failed') status = 'failed';
  return { rawEvent: event, status, entity };
}

export function normalizeRazorpayPayment(entity, fallback = {}) {
  if (!entity) throw new ValidationError('Razorpay webhook is missing payload.payment.entity.');
  const notes = entity.notes ?? {};
  const amountInMinor = Number(entity.amount ?? 0);
  const amount = Number.isFinite(amountInMinor) ? amountInMinor / 100 : 0;

  return {
    gateway: 'razorpay',
    transactionId: String(entity.id ?? '').trim(),
    orderId: entity.order_id ? String(entity.order_id) : undefined,
    amount,
    totalAmount: Number(notes.totalAmount ?? fallback.totalAmount ?? 0),
    currency: String(entity.currency ?? 'INR').toUpperCase(),
    email: entity.email ?? notes.email ?? fallback.email,
    name: notes.name ?? fallback.name,
    serviceName: notes.serviceName ?? fallback.serviceName,
    projectId: notes.projectId ?? fallback.projectId,
    isRemainingPayment: String(notes.isRemainingPayment ?? fallback.isRemainingPayment ?? '') === 'true',
    status: entity.status === 'failed' ? 'failed' : 'captured',
    details: {
      gateway: 'razorpay',
      transactionId: entity.id ?? null,
      orderId: entity.order_id ?? null,
      amount,
      currency: entity.currency ?? 'INR',
      method: entity.method ?? null,
      status: entity.status ?? null,
      description: entity.description ?? null,
    },
  };
}

function paypalBaseUrl() {
  return (process.env.PAYPAL_API_BASE ?? 'https://api-m.paypal.com').replace(/\/+$/, '');
}

async function getPaypalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new ConfigError('PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required to verify PayPal webhooks.');
  }

  const response = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new ConfigError(`PayPal OAuth token request failed with status ${response.status}.`);
  }
  const json = await response.json();
  if (!json.access_token) throw new ConfigError('PayPal OAuth response did not include an access token.');
  return json.access_token;
}

function headerValue(headers, name) {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function verifyPaypalWebhook(headers, rawBody) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    throw new ConfigError('PAYPAL_WEBHOOK_ID is not configured on the server.');
  }

  const required = {
    auth_algo: headerValue(headers, 'paypal-auth-algo'),
    transmission_id: headerValue(headers, 'paypal-transmission-id'),
    cert_url: headerValue(headers, 'paypal-cert-url'),
    auth_verification_id: headerValue(headers, 'paypal-auth-verification-id'),
    transmission_time: headerValue(headers, 'paypal-transmission-time'),
    transmission_sig: headerValue(headers, 'paypal-transmission-sig'),
  };

  const missing = Object.entries(required).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) {
    throw new ValidationError(`Missing PayPal webhook signature headers: ${missing.join(', ')}.`, 401);
  }

      let certHost;
  try {
    certHost = new URL(String(required.cert_url)).hostname.toLowerCase();
  } catch {
    throw new ValidationError('PayPal cert_url is not a valid URL.', 401);
  }
  if (!['api.paypal.com', 'api-m.paypal.com'].includes(certHost)) {
    throw new ValidationError('PayPal cert_url does not point at a trusted PayPal host.', 401);
  }

  let webhookEvent;
  try {
    webhookEvent = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new ValidationError('PayPal webhook body is not valid JSON.');
  }

  const accessToken = await getPaypalAccessToken();
  const response = await fetch(`${paypalBaseUrl()}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ ...required, webhook_id: webhookId, webhook_event: webhookEvent }),
  });

  if (!response.ok) {
    throw new ValidationError(`PayPal signature verification returned ${response.status}.`, 401);
  }
  const result = await response.json();
  if (result.verification_status !== 'SUCCESS') {
    throw new ValidationError('PayPal webhook signature verification failed.', 401);
  }
  return webhookEvent;
}

export function parsePaypalEvent(payload) {
  const eventType = String(payload?.event_type ?? '').trim().toUpperCase();
  let status = 'ignored';
  if (eventType === 'PAYMENT.CAPTURE.COMPLETED' || eventType === 'CHECKOUT.ORDER.COMPLETED') status = 'captured';
  else if (eventType === 'PAYMENT.CAPTURE.DENIED' || eventType === 'PAYMENT.CAPTURE.REFUNDED' || eventType === 'PAYMENT.CAPTURE.REVERSED') status = 'failed';
  else if (eventType === 'PAYMENT.CAPTURE.PENDING') status = 'pending';
  return { rawEvent: eventType, status, resource: payload?.resource ?? null };
}

// [PAYPAL SERVER CAPTURE] Client ke actions.order.capture() par bharosa na karke
// order ko server-side capture karte hain, taaki PAYPAL_WEBHOOK_ID na hone par bhi provisioning ho.
export async function capturePaypalOrder(
  orderId,
  { expectedTotalAmount = null, exactAmount = false, validateOrderMetadata } = {}
) {
  const id = String(orderId ?? '').trim();
  if (!id) throw new ValidationError('A PayPal order ID is required.');

  const accessToken = await getPaypalAccessToken();
  const orderUrl = `${paypalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(id)}`;
  const orderResponse = await fetch(orderUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });
  let order = await orderResponse.json().catch(() => null);
  if (!orderResponse.ok || !order) {
    throw new ValidationError('Could not read this PayPal order from PayPal.', 502);
  }

  const requestedUnit = Array.isArray(order.purchase_units) ? order.purchase_units[0] : null;
  const requestedAmount = Number(requestedUnit?.amount?.value);
  const requestedCurrency = String(requestedUnit?.amount?.currency_code ?? '').toUpperCase();
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0 || requestedCurrency !== 'USD') {
    throw new ValidationError('PayPal order has an invalid amount or currency.', 409);
  }
  if (typeof validateOrderMetadata === 'function') {
    const metadata = normalizePaypalPayment({
      custom_id: requestedUnit?.custom_id,
      payer: order?.payer,
      amount: requestedUnit?.amount,
    });
    await validateOrderMetadata(metadata, order);
  }
  if (Number.isFinite(Number(expectedTotalAmount)) && Number(expectedTotalAmount) > 0) {
    const expected = Math.round(Number(expectedTotalAmount) * 100) / 100;
    const validAmount = exactAmount
      ? Math.abs(requestedAmount - expected) <= 0.01
      : requestedAmount >= Math.round(expected * 0.4 * 100) / 100 - 0.01 && requestedAmount <= expected + 0.01;
    if (!validAmount) {
      throw new ValidationError('PayPal order amount does not match the approved project valuation.', 409);
    }
  }

  if (String(order.status ?? '').toUpperCase() !== 'COMPLETED') {
    const captureResponse = await fetch(`${orderUrl}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `capture-${id}`,
      },
      body: '{}',
    });

    const capturedOrder = await captureResponse.json().catch(() => null);
    if (captureResponse.ok && capturedOrder) {
      order = capturedOrder;
    } else {
      const issue = capturedOrder?.details?.[0]?.issue ?? '';
      const alreadyCaptured = captureResponse.status === 422 || issue === 'ORDER_ALREADY_CAPTURED';
      if (!alreadyCaptured) {
        throw new ValidationError(
          capturedOrder?.message
            ? `PayPal capture failed: ${capturedOrder.message}`
            : `PayPal capture failed with status ${captureResponse.status}.`,
          502
        );
      }
      const completedResponse = await fetch(orderUrl, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      });
      order = await completedResponse.json().catch(() => null);
      if (!completedResponse.ok || !order) {
        throw new ValidationError('Could not read this PayPal order from PayPal.', 502);
      }
    }
  }

  const unit = Array.isArray(order?.purchase_units) ? order.purchase_units[0] : null;
  const capture = unit?.payments?.captures?.[0];
  if (!capture) {
    throw new ValidationError('PayPal order has no completed capture yet.', 409);
  }
  if (String(capture.status ?? '').toUpperCase() !== 'COMPLETED') {
    throw new ValidationError(`PayPal capture is ${capture.status ?? 'not completed'}.`, 409);
  }

  const normalized = normalizePaypalPayment(
    { ...capture, custom_id: unit?.custom_id ?? capture.custom_id, payer: order?.payer },
    {}
  );
  if (Math.abs(normalized.amount - requestedAmount) > 0.01 || normalized.currency !== requestedCurrency) {
    throw new ValidationError('Captured PayPal amount differs from the approved order amount.', 409);
  }

  return {
    orderId: id,
    captureId: normalized.transactionId,
    amount: normalized.amount,
    currency: normalized.currency,
    email: normalized.email ?? null,
    name: normalized.name ?? null,
    serviceName: normalized.serviceName ?? null,
    serviceId: normalized.serviceId ?? null,
    projectId: normalized.projectId ?? null,
    isRemainingPayment: normalized.isRemainingPayment,
  };
}

export function normalizePaypalPayment(resource, fallback = {}) {
  if (!resource) throw new ValidationError('PayPal webhook is missing a resource object.');

  let custom = {};
  if (typeof resource.custom_id === 'string' && resource.custom_id.trim().startsWith('{')) {
    try {
      custom = JSON.parse(resource.custom_id);
    } catch {
      custom = {};
    }
  } else if (resource.custom_id) {
    custom = { email: resource.custom_id };
  }

  const payerName = resource.payer?.name;
  const combinedName = payerName
    ? [payerName.given_name, payerName.surname].filter(Boolean).join(' ')
    : undefined;

  return {
    gateway: 'paypal',
    transactionId: String(resource.id ?? resource.capture_id ?? '').trim(),
    orderId: resource.supplementary_data?.related_ids?.order_id ?? resource.id,
    amount: Number(resource.amount?.value ?? 0),
    currency: String(resource.amount?.currency_code ?? 'USD').toUpperCase(),
    email: resource.payer?.email_address ?? custom.email ?? fallback.email,
    name: combinedName ?? custom.name ?? fallback.name,
    serviceName: custom.serviceName ?? custom.n ?? fallback.serviceName,
    serviceId: custom.serviceId ?? custom.s ?? fallback.serviceId,
    projectId: custom.projectId ?? custom.p ?? fallback.projectId,
    isRemainingPayment: String(custom.isRemainingPayment ?? custom.r ?? fallback.isRemainingPayment ?? '') === 'true' || custom.r === 1,
    status: 'captured',
    details: {
      gateway: 'paypal',
      transactionId: resource.id ?? null,
      orderId: resource.supplementary_data?.related_ids?.order_id ?? null,
      amount: Number(resource.amount?.value ?? 0),
      currency: resource.amount?.currency_code ?? null,
      status: resource.status ?? null,
    },
  };
}
