import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import {
  loadConnectionConfig,
  loadPendingPayment,
  savePendingPayment,
  markPaymentExpired,
} from "../lib/supabase-client.ts";
import { getKeyDetails, updateKeyLimit } from "../lib/openrouter-keys.ts";
import {
  createCheckoutSession,
  isStripeConfigured,
} from "../lib/stripe-client.ts";
import { logger } from "../lib/logger.ts";
import {
  HARD_CAP_USD,
  MIN_STRIPE_AMOUNT_CENTS,
  ALLOWED_REDIRECT_DOMAINS,
} from "../lib/constants.ts";
import type { Env } from "../types/env.ts";

function getBaseUrl(meshUrl: string | undefined): string {
  if (process.env.GATEWAY_PUBLIC_URL) {
    return process.env.GATEWAY_PUBLIC_URL;
  }
  if (meshUrl) {
    try {
      const host = new URL(meshUrl).hostname;
      if (
        ALLOWED_REDIRECT_DOMAINS.some(
          (d) => host === d || host.endsWith(`.${d}`),
        )
      ) {
        return meshUrl;
      }
    } catch {
      /* invalid URL, fall through */
    }
  }
  return "https://sites-deco-ai-gateway.decocache.com";
}

const outputSchema = z
  .object({
    summary: z.string(),
    billing_mode: z.enum(["prepaid", "postpaid"]),
    checkout_url: z.string().nullable(),
    amount_usd: z.number().nullable(),
    markup_pct: z.number(),
    current_limit_usd: z.number(),
    new_limit_usd: z.number(),
    connectionId: z.string(),
  })
  .strict();

export const createSetLimitTool = (env: Env) =>
  createTool({
    id: "GATEWAY_SET_LIMIT",
    description:
      "Sets the spending limit for this organization's AI Gateway. " +
      "In prepaid mode (default), generates a Stripe payment link for the difference — " +
      "call GATEWAY_CONFIRM_PAYMENT after paying to activate. " +
      "In postpaid mode (pay-per-use), the limit is updated immediately without payment.",
    inputSchema: z
      .object({
        limit_usd: z
          .number()
          .positive()
          .describe(
            "Desired new spending limit in USD. Must be greater than the current limit. Examples: 5, 10, 50",
          ),
      })
      .strict(),
    outputSchema,
    execute: async ({ context }) => {
      const { limit_usd: newLimit } = context;

      const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
      const organizationId = env.MESH_REQUEST_CONTEXT?.organizationId;
      const meshUrl = env.MESH_REQUEST_CONTEXT?.meshUrl;
      if (!connectionId || !organizationId) {
        throw new Error("connectionId or organizationId not found in context.");
      }

      const row = await loadConnectionConfig(connectionId);
      if (!row?.openrouter_key_hash) {
        throw new Error(
          "No OpenRouter key provisioned yet. Make an LLM call first to trigger automatic provisioning.",
        );
      }

      const keyDetails = await getKeyDetails(row.openrouter_key_hash);
      const currentLimit = keyDetails.limit ?? 0;

      if (newLimit <= currentLimit) {
        throw new Error(
          `New limit ($${newLimit.toFixed(2)}) must be greater than current limit ($${currentLimit.toFixed(2)}).`,
        );
      }

      const effectiveCap = row.max_limit_usd ?? HARD_CAP_USD;
      if (newLimit > effectiveCap) {
        throw new Error(
          `New limit ($${newLimit.toFixed(2)}) exceeds the maximum allowed ($${effectiveCap.toFixed(2)}).`,
        );
      }

      const billingMode = row.billing_mode ?? "prepaid";
      const markupPct = row.usage_markup_pct ?? 0;

      if (billingMode === "postpaid") {
        return handlePostpaid(
          row.openrouter_key_hash,
          currentLimit,
          newLimit,
          connectionId,
          markupPct,
        );
      }

      return handlePrepaid(
        currentLimit,
        newLimit,
        connectionId,
        organizationId,
        meshUrl,
        markupPct,
      );
    },
  });

async function handlePostpaid(
  keyHash: string,
  currentLimit: number,
  newLimit: number,
  connectionId: string,
  markupPct: number,
): Promise<z.infer<typeof outputSchema>> {
  await updateKeyLimit(keyHash, newLimit, null, false);

  logger.info("Postpaid limit updated directly", {
    connectionId,
    currentLimit,
    newLimit,
    markupPct,
  });

  const lines = [
    `Spending limit updated (postpaid mode).`,
    `Previous limit: $${currentLimit.toFixed(2)}`,
    `New limit: $${newLimit.toFixed(2)}`,
  ];
  if (markupPct > 0) {
    lines.push(`Usage markup: ${markupPct}%`);
  }

  return {
    summary: lines.join("\n"),
    billing_mode: "postpaid",
    checkout_url: null,
    amount_usd: null,
    markup_pct: markupPct,
    current_limit_usd: currentLimit,
    new_limit_usd: newLimit,
    connectionId,
  };
}

async function handlePrepaid(
  currentLimit: number,
  newLimit: number,
  connectionId: string,
  organizationId: string,
  meshUrl: string | undefined,
  markupPct: number,
): Promise<z.infer<typeof outputSchema>> {
  if (!isStripeConfigured()) {
    throw new Error(
      "Stripe is not configured. STRIPE_SECRET_KEY env var is required.",
    );
  }

  const existingPending = await loadPendingPayment(connectionId);
  if (existingPending?.id) {
    await markPaymentExpired(existingPending.id);
    logger.info("Expired previous pending payment before creating new one", {
      connectionId,
      expiredPaymentId: existingPending.id,
    });
  }

  const incrementUsd = newLimit - currentLimit;
  const markupMultiplier = 1 + markupPct / 100;
  const chargeUsd = incrementUsd * markupMultiplier;
  const amountCents = Math.round(chargeUsd * 100);

  if (amountCents < MIN_STRIPE_AMOUNT_CENTS) {
    throw new Error(
      `Minimum payment is $0.50. Increase the limit by at least $${(MIN_STRIPE_AMOUNT_CENTS / 100 / markupMultiplier).toFixed(2)}.`,
    );
  }

  const baseUrl = getBaseUrl(meshUrl);
  const { sessionId, checkoutUrl } = await createCheckoutSession({
    amountCents,
    currentLimitUsd: currentLimit,
    newLimitUsd: newLimit,
    connectionId,
    organizationId,
    successUrl: `${baseUrl}/payment/success`,
    cancelUrl: `${baseUrl}/payment/cancel`,
  });

  await savePendingPayment({
    connection_id: connectionId,
    organization_id: organizationId,
    stripe_session_id: sessionId,
    amount_cents: amountCents,
    current_limit_usd: currentLimit,
    new_limit_usd: newLimit,
    markup_pct: markupPct,
    status: "pending",
  });

  logger.info("Prepaid limit increase payment initiated", {
    connectionId,
    currentLimit,
    newLimit,
    incrementUsd,
    markupPct,
    chargeUsd,
    stripeSessionId: sessionId,
  });

  const lines = [
    `Payment link generated for limit increase (prepaid mode).`,
    `Current limit: $${currentLimit.toFixed(2)}`,
    `Requested limit: $${newLimit.toFixed(2)}`,
    `Credit increment: $${incrementUsd.toFixed(2)}`,
  ];
  if (markupPct > 0) {
    lines.push(
      `Service fee (${markupPct}%): $${(chargeUsd - incrementUsd).toFixed(2)}`,
    );
  }
  lines.push(
    `Total to pay: $${chargeUsd.toFixed(2)}`,
    `After payment, call GATEWAY_CONFIRM_PAYMENT to activate the new limit.`,
  );

  return {
    summary: lines.join("\n"),
    billing_mode: "prepaid",
    checkout_url: checkoutUrl,
    amount_usd: chargeUsd,
    markup_pct: markupPct,
    current_limit_usd: currentLimit,
    new_limit_usd: newLimit,
    connectionId,
  };
}

export const setLimitTools = [createSetLimitTool];
