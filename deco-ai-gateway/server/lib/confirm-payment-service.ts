import {
  loadConnectionConfig,
  claimPendingPayment,
  releasePaymentClaim,
  markPaymentCompleted,
  markPaymentExpired,
} from "./supabase-client.ts";
import { updateKeyLimit } from "./openrouter-keys.ts";
import { retrieveSessionStatus } from "./stripe-client.ts";
import { logger } from "./logger.ts";

export type ConfirmResult =
  | { status: "confirmed"; newLimitUsd: number }
  | { status: "pending" }
  | { status: "expired" }
  | { status: "no_pending" }
  | { status: "error"; message: string };

/**
 * Confirm a pending Stripe payment for a connection.
 * Verifies the Stripe session, applies the new OpenRouter limit, and marks the payment complete.
 * Called server-side from the /payment/success HTTP handler.
 */
export async function confirmPaymentForConnection(
  connectionId: string,
): Promise<ConfirmResult> {
  try {
    const row = await loadConnectionConfig(connectionId);
    if (!row?.openrouter_key_hash) {
      return { status: "error", message: "No OpenRouter key provisioned." };
    }

    const payment = await claimPendingPayment(connectionId);
    if (!payment) {
      return { status: "no_pending" };
    }

    if (!payment.id) {
      return { status: "error", message: "Payment record missing id." };
    }

    const session = await retrieveSessionStatus(payment.stripe_session_id);

    if (session.status === "expired") {
      await markPaymentExpired(payment.id);
      logger.info("Stripe session expired during server-side confirm", {
        connectionId,
        stripeSessionId: payment.stripe_session_id,
      });
      return { status: "expired" };
    }

    if (session.status !== "paid") {
      await releasePaymentClaim(payment.id);
      logger.debug("Payment not yet completed during server-side confirm", {
        connectionId,
        stripeStatus: session.status,
      });
      return { status: "pending" };
    }

    if (session.amountTotal !== payment.amount_cents) {
      await releasePaymentClaim(payment.id);
      logger.error("Stripe amount mismatch during server-side confirm", {
        connectionId,
        expected: payment.amount_cents,
        received: session.amountTotal,
      });
      return {
        status: "error",
        message: `Amount mismatch: expected ${payment.amount_cents} cents, got ${session.amountTotal} cents.`,
      };
    }

    await updateKeyLimit(
      row.openrouter_key_hash,
      payment.new_limit_usd,
      "monthly",
      false,
    );
    await markPaymentCompleted(payment.id);

    logger.info("Payment confirmed server-side, limit updated", {
      connectionId,
      newLimit: payment.new_limit_usd,
    });

    return { status: "confirmed", newLimitUsd: payment.new_limit_usd };
  } catch (error) {
    logger.error("Error during server-side payment confirmation", {
      connectionId,
      error: String(error),
    });
    return { status: "error", message: String(error) };
  }
}
