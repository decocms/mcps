import type { LlmGatewayConnectionRow } from "./supabase-client.ts";
import { claimAlertSlot } from "./supabase-client.ts";
import { sendEmail } from "./email-sender.ts";
import { logger } from "./logger.ts";

function formatUSD(value: number): string {
  return `$${value.toFixed(2)}`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildAlertHtml(
  remaining: number,
  total: number,
  thresholdUsd: number,
  orgName: string | undefined,
): string {
  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 0;">
  <h2 style="margin: 0 0 8px;">Low Credit Alert</h2>
  <p style="color: #666; margin: 0 0 24px; font-size: 14px;">
    ${orgName ? `Organization: <strong>${escapeHtml(orgName)}</strong>` : "Your AI Gateway credit is running low."}
  </p>

  <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
    <p style="margin: 0; font-size: 14px; color: #92400e;">
      Your remaining credit is <strong>${formatUSD(remaining)}</strong> out of <strong>${formatUSD(total)}</strong>.
      This is below your ${formatUSD(thresholdUsd)} alert threshold.
    </p>
  </div>

  <p style="font-size: 13px; color: #888; margin: 0;">
    Add more credit from your Mesh billing settings to avoid service interruption.
  </p>
</div>`.trim();
}

/**
 * Checks if a low-balance alert should be sent and sends it.
 *
 * Conditions to fire:
 *  1. alert_enabled = true
 *  2. alert_email is set
 *  3. Limit exists (prepaid)
 *  4. Remaining <= threshold USD value
 *  5. Alert not already sent for this limit value (prevents re-send spam;
 *     resets when the user tops up / changes limit)
 *
 * Runs fire-and-forget — errors are logged but never thrown.
 */
export async function checkAndSendBalanceAlert(
  row: LlmGatewayConnectionRow,
  limitTotal: number | null,
  limitRemaining: number | null,
  orgName?: string,
): Promise<void> {
  try {
    if (
      !row.alert_enabled ||
      !row.alert_email ||
      limitTotal == null ||
      limitRemaining == null
    ) {
      return;
    }

    const thresholdUsd = row.alert_threshold_usd ?? 10;

    if (limitRemaining > thresholdUsd) return;

    const claimed = await claimAlertSlot(row.connection_id, limitTotal);
    if (!claimed) {
      logger.debug("Alert already sent for this limit value", {
        connectionId: row.connection_id,
        limit: limitTotal,
      });
      return;
    }

    const subject = `Low Credit Alert — ${formatUSD(limitRemaining)} remaining`;

    await sendEmail({
      to: row.alert_email,
      subject,
      html: buildAlertHtml(limitRemaining, limitTotal, thresholdUsd, orgName),
    });

    logger.info("Low-balance alert email sent", {
      connectionId: row.connection_id,
      remaining: limitRemaining,
      total: limitTotal,
      thresholdUsd,
    });
  } catch (error) {
    logger.error("Balance alert check failed", {
      connectionId: row.connection_id,
      error: String(error),
    });
  }
}
