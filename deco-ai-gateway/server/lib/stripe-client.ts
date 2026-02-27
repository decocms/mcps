import Stripe from "stripe";
import { logger } from "./logger.ts";

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (stripeClient) return stripeClient;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY env var is required for payments");
  }

  stripeClient = new Stripe(secretKey, { apiVersion: "2026-02-25.clover" });
  return stripeClient;
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export interface CheckoutParams {
  amountCents: number;
  currentLimitUsd: number;
  newLimitUsd: number;
  connectionId: string;
  organizationId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  sessionId: string;
  checkoutUrl: string;
}

export async function createCheckoutSession(
  params: CheckoutParams,
): Promise<CheckoutResult> {
  const stripe = getStripe();

  logger.info("Creating Stripe checkout session", {
    connectionId: params.connectionId,
    amountCents: params.amountCents,
    newLimitUsd: params.newLimitUsd,
  });

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "AI Gateway Credits",
            description: `Increase spending limit from $${params.currentLimitUsd.toFixed(2)} to $${params.newLimitUsd.toFixed(2)}`,
          },
          unit_amount: params.amountCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      connection_id: params.connectionId,
      organization_id: params.organizationId,
      new_limit_usd: String(params.newLimitUsd),
      current_limit_usd: String(params.currentLimitUsd),
    },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL");
  }

  logger.info("Stripe checkout session created", {
    sessionId: session.id,
    connectionId: params.connectionId,
  });

  return {
    sessionId: session.id,
    checkoutUrl: session.url,
  };
}

export type StripePaymentStatus =
  | "paid"
  | "unpaid"
  | "no_payment_required"
  | "expired";

export interface SessionStatus {
  status: StripePaymentStatus;
  amountTotal: number | null;
}

export async function retrieveSessionStatus(
  sessionId: string,
): Promise<SessionStatus> {
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.retrieve(sessionId);

  return {
    status: session.payment_status as StripePaymentStatus,
    amountTotal: session.amount_total,
  };
}
