import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import {
  loadConnectionConfig,
  claimPendingPayment,
  releasePaymentClaim,
  markPaymentCompleted,
  markPaymentExpired,
} from "../lib/supabase-client.ts";
import { updateKeyLimit } from "../lib/openrouter-keys.ts";
import { retrieveSessionStatus } from "../lib/stripe-client.ts";
import { logger } from "../lib/logger.ts";
import type { Env } from "../types/env.ts";

export const createConfirmPaymentTool = (env: Env) =>
  createTool({
    id: "GATEWAY_CONFIRM_PAYMENT",
    description:
      "Checks the status of a pending Stripe payment for a limit increase. " +
      "If the payment has been completed, the new spending limit is applied automatically. " +
      "Call this after the user has paid via the Stripe checkout link from GATEWAY_SET_LIMIT.",
    inputSchema: z.object({}).strict(),
    outputSchema: z
      .object({
        summary: z.string(),
        status: z.enum(["confirmed", "pending", "expired", "no_pending"]),
        new_limit_usd: z.number().nullable(),
        checkout_url: z.string().nullable(),
        connectionId: z.string(),
      })
      .strict(),
    execute: async () => {
      const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
      if (!connectionId) {
        throw new Error("connectionId not found in context.");
      }

      const row = await loadConnectionConfig(connectionId);
      if (!row?.openrouter_key_hash) {
        throw new Error(
          "No OpenRouter key provisioned yet. Make an LLM call first to trigger automatic provisioning.",
        );
      }

      const payment = await claimPendingPayment(connectionId);
      if (!payment) {
        return {
          summary:
            "No pending payment found. Use GATEWAY_SET_LIMIT to request a limit increase first.",
          status: "no_pending" as const,
          new_limit_usd: null,
          checkout_url: null,
          connectionId,
        };
      }

      if (!payment.id) {
        throw new Error("Payment record missing id");
      }

      const session = await retrieveSessionStatus(payment.stripe_session_id);

      if (session.status === "expired") {
        await markPaymentExpired(payment.id);
        logger.info("Stripe session expired", {
          connectionId,
          stripeSessionId: payment.stripe_session_id,
        });

        return {
          summary:
            "Payment session has expired. Use GATEWAY_SET_LIMIT to generate a new payment link.",
          status: "expired" as const,
          new_limit_usd: null,
          checkout_url: null,
          connectionId,
        };
      }

      if (session.status !== "paid") {
        await releasePaymentClaim(payment.id);
        logger.debug("Payment not yet completed, claim released", {
          connectionId,
          stripeStatus: session.status,
        });

        return {
          summary: `Payment is still pending (status: ${session.status}). Please complete the payment first.`,
          status: "pending" as const,
          new_limit_usd: payment.new_limit_usd,
          checkout_url: null,
          connectionId,
        };
      }

      if (session.amountTotal !== payment.amount_cents) {
        await releasePaymentClaim(payment.id);
        logger.error("Stripe amount mismatch", {
          connectionId,
          expected: payment.amount_cents,
          received: session.amountTotal,
          stripeSessionId: payment.stripe_session_id,
        });

        throw new Error(
          `Payment amount mismatch: expected ${payment.amount_cents} cents, ` +
            `got ${session.amountTotal} cents. Payment not applied for safety.`,
        );
      }

      try {
        await updateKeyLimit(
          row.openrouter_key_hash,
          payment.new_limit_usd,
          "monthly",
          false,
        );
        await markPaymentCompleted(payment.id);
      } catch (err) {
        await releasePaymentClaim(payment.id).catch(() => {});
        throw err;
      }

      logger.info("Payment confirmed, limit updated", {
        connectionId,
        newLimit: payment.new_limit_usd,
      });

      return {
        summary: `Payment confirmed! Spending limit updated to $${payment.new_limit_usd.toFixed(2)}.`,
        status: "confirmed" as const,
        new_limit_usd: payment.new_limit_usd,
        checkout_url: null,
        connectionId,
      };
    },
  });

export const confirmPaymentTools = [createConfirmPaymentTool];
