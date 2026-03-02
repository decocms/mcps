import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import {
  loadConnectionConfig,
  loadPendingPayment,
  savePendingPayment,
  markPaymentExpired,
  updateBillingConfig,
  type BillingMode,
  type LimitPeriod,
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
import { ensureApiKey } from "../lib/provisioning.ts";
import type { Env } from "../types/env.ts";

function isAllowedOrigin(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return ALLOWED_REDIRECT_DOMAINS.some(
      (d) => host === d || host.endsWith(`.${d}`),
    );
  } catch {
    return false;
  }
}

function getBaseUrl(meshUrl: string | undefined): string {
  if (process.env.GATEWAY_PUBLIC_URL) {
    return process.env.GATEWAY_PUBLIC_URL;
  }
  if (meshUrl && isAllowedOrigin(meshUrl)) {
    return meshUrl;
  }
  return "https://sites-deco-ai-gateway.decocache.com";
}

function sanitizeRedirectUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (isAllowedOrigin(url)) return url;
  return undefined;
}

const outputSchema = z
  .object({
    summary: z.string(),
    billing_mode: z.enum(["prepaid", "postpaid"]),
    limit_period: z.enum(["daily", "weekly", "monthly"]).nullable(),
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
      "the new limit is activated automatically after payment. " +
      "In postpaid mode (pay-per-use), the limit is updated immediately without payment.",
    inputSchema: z
      .object({
        limit_usd: z
          .number()
          .positive()
          .describe(
            "Desired new spending limit in USD. In prepaid mode must be greater than the current limit. In postpaid mode can be set to any positive value. Examples: 5, 10, 50",
          ),
        limit_period: z
          .enum(["daily", "weekly", "monthly", "none"])
          .optional()
          .describe(
            "Limit reset period. Only applies to postpaid mode. 'none' removes the reset. Omit to keep the current period.",
          ),
        billing_mode: z
          .enum(["prepaid", "postpaid"])
          .optional()
          .describe(
            "Optional explicit billing mode. Useful for migrating legacy connections where DB mode is stale.",
          ),
        return_url: z
          .string()
          .url()
          .optional()
          .describe(
            "URL to redirect to after payment (current page URL). If not provided, falls back to the mesh URL.",
          ),
      })
      .strict(),
    outputSchema,
    execute: async ({ context }) => {
      const {
        limit_usd: newLimit,
        limit_period: limitPeriodInput,
        billing_mode: billingModeInput,
        return_url: returnUrl,
      } = context;

      const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
      const organizationId = env.MESH_REQUEST_CONTEXT?.organizationId;
      const meshUrl = env.MESH_REQUEST_CONTEXT?.meshUrl;
      if (!connectionId || !organizationId) {
        throw new Error("connectionId or organizationId not found in context.");
      }

      await ensureApiKey(connectionId, organizationId, meshUrl ?? "");

      const row = await loadConnectionConfig(connectionId);
      if (!row?.openrouter_key_hash) {
        throw new Error(
          "Failed to provision OpenRouter API key. Please try again.",
        );
      }

      const keyDetails = await getKeyDetails(row.openrouter_key_hash);
      const currentLimit = keyDetails.limit ?? 0;

      const effectiveCap = row.max_limit_usd ?? HARD_CAP_USD;
      if (newLimit > effectiveCap) {
        throw new Error(
          `New limit ($${newLimit.toFixed(2)}) exceeds the maximum allowed ($${effectiveCap.toFixed(2)}).`,
        );
      }
      const markupPct = row.usage_markup_pct ?? 0;

      // Resolve limit_period: explicit input overrides DB value; "none" clears it
      const currentLimitPeriod = row.limit_period ?? null;
      const resolvedLimitPeriod: LimitPeriod | null =
        limitPeriodInput === undefined
          ? currentLimitPeriod
          : limitPeriodInput === "none"
            ? null
            : (limitPeriodInput as LimitPeriod);

      const billingModeFromDb = row.billing_mode ?? "prepaid";
      const effectiveBillingMode: BillingMode =
        billingModeInput ??
        (limitPeriodInput !== undefined ? "postpaid" : billingModeFromDb);

      if (effectiveBillingMode === "prepaid" && newLimit <= currentLimit) {
        throw new Error(
          `New limit ($${newLimit.toFixed(2)}) must be greater than current limit ($${currentLimit.toFixed(2)}).`,
        );
      }

      if (effectiveBillingMode === "postpaid") {
        return handlePostpaid(
          row.openrouter_key_hash,
          currentLimit,
          newLimit,
          connectionId,
          markupPct,
          resolvedLimitPeriod,
        );
      }

      return handlePrepaid(
        currentLimit,
        newLimit,
        connectionId,
        organizationId,
        meshUrl,
        sanitizeRedirectUrl(returnUrl) ?? sanitizeRedirectUrl(meshUrl),
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
  limitPeriod: LimitPeriod | null,
): Promise<z.infer<typeof outputSchema>> {
  await updateKeyLimit(keyHash, newLimit, limitPeriod, false);

  await updateBillingConfig(connectionId, {
    billingMode: "postpaid",
    isSubscription: limitPeriod === "monthly",
    limitPeriod,
  });

  logger.info("Postpaid limit updated directly", {
    connectionId,
    currentLimit,
    newLimit,
    markupPct,
    limitPeriod,
  });

  const periodLabel = limitPeriod
    ? { daily: "daily", weekly: "weekly", monthly: "monthly" }[limitPeriod]
    : null;

  const lines = [
    `Spending limit updated (postpaid mode).`,
    `Previous limit: $${currentLimit.toFixed(2)}`,
    `New limit: $${newLimit.toFixed(2)}${periodLabel ? ` (resets ${periodLabel})` : ""}`,
  ];
  if (markupPct > 0) {
    lines.push(`Usage markup: ${markupPct}%`);
  }

  return {
    summary: lines.join("\n"),
    billing_mode: "postpaid",
    limit_period: limitPeriod,
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
  gatewayMeshUrl: string | undefined,
  redirectUrl: string | undefined,
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

  const gatewayBaseUrl = getBaseUrl(gatewayMeshUrl);

  const successUrl = redirectUrl
    ? `${gatewayBaseUrl}/payment/success?connection_id=${encodeURIComponent(connectionId)}&redirect=${encodeURIComponent(redirectUrl)}`
    : `${gatewayBaseUrl}/payment/success?connection_id=${encodeURIComponent(connectionId)}`;

  const cancelUrl = redirectUrl
    ? `${gatewayBaseUrl}/payment/cancel?redirect=${encodeURIComponent(redirectUrl)}`
    : `${gatewayBaseUrl}/payment/cancel`;

  const { sessionId, checkoutUrl } = await createCheckoutSession({
    amountCents,
    currentLimitUsd: currentLimit,
    newLimitUsd: newLimit,
    connectionId,
    organizationId,
    successUrl,
    cancelUrl,
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
    `After payment, the new limit will be activated automatically.`,
  );

  return {
    summary: lines.join("\n"),
    billing_mode: "prepaid",
    limit_period: null,
    checkout_url: checkoutUrl,
    amount_usd: chargeUsd,
    markup_pct: markupPct,
    current_limit_usd: currentLimit,
    new_limit_usd: newLimit,
    connectionId,
  };
}

export const setLimitTools = [createSetLimitTool];
