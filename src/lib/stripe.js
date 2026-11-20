import Stripe from 'stripe';

export class StripeNotConfiguredError extends Error {
  constructor() {
    super('Payments are not configured');
    this.name = 'StripeNotConfiguredError';
    this.status = 503;
  }
}

let cached = null;

// Lazy so the server boots (and every other route works) without Stripe keys.
export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new StripeNotConfiguredError();
  }
  if (!cached) {
    cached = new Stripe(key);
  }
  return cached;
}

export function getWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new StripeNotConfiguredError();
  }
  return secret;
}

// First entry of CLIENT_URLS is the canonical client origin used in redirects.
export function getClientUrl() {
  const raw = process.env.CLIENT_URLS || 'http://localhost:3000';
  const first = raw.split(',').map((value) => value.trim()).filter(Boolean)[0];
  return (first || 'http://localhost:3000').replace(/\/$/, '');
}
