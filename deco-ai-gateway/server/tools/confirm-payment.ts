import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { confirmPaymentForConnection } from "../lib/confirm-payment-service.ts";
import type { Env } from "../types/env.ts";

const SUMMARY_MAP: Record<string, string> = {
  confirmed: "Payment confirmed! Spending limit has been updated.",
  pending: "Payment is still being processed. Please wait a moment.",
  expired:
    "Payment session has expired. Use GATEWAY_SET_LIMIT to generate a new payment link.",
  no_pending:
    "No pending payment found. Use GATEWAY_SET_LIMIT to request a limit increase first.",
};

export const createConfirmPaymentTool = (env: Env) =>
  createTool({
    id: "GATEWAY_CONFIRM_PAYMENT",
    description:
      "Checks the status of a pending Stripe payment for a limit increase. " +
      "If the payment has been completed, the new spending limit is applied automatically. " +
      "Normally called server-side after Stripe redirect, but can also be invoked manually.",
    inputSchema: z.object({}).strict(),
    outputSchema: z
      .object({
        summary: z.string(),
        status: z.enum(["confirmed", "pending", "expired", "no_pending"]),
        new_limit_usd: z.number().nullable(),
        connectionId: z.string(),
      })
      .strict(),
    execute: async () => {
      const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
      if (!connectionId) {
        throw new Error("connectionId not found in context.");
      }

      const result = await confirmPaymentForConnection(connectionId);

      if (result.status === "error") {
        throw new Error(result.message);
      }

      const newLimitUsd =
        result.status === "confirmed" ? result.newLimitUsd : null;

      return {
        summary:
          result.status === "confirmed" && newLimitUsd != null
            ? `${SUMMARY_MAP[result.status]} New limit: $${newLimitUsd.toFixed(2)}.`
            : SUMMARY_MAP[result.status],
        status: result.status,
        new_limit_usd: newLimitUsd,
        connectionId,
      };
    },
  });

export const confirmPaymentTools = [createConfirmPaymentTool];
