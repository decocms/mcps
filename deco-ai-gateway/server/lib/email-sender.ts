import { logger } from "./logger.ts";

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

/**
 * Send an email via Resend API.
 * Requires RESEND_API_KEY env var.
 * Falls back to logging when not configured (dev mode).
 */
export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.RESEND_FROM_EMAIL ?? "Deco AI Gateway <noreply@deco.cx>";

  if (!apiKey) {
    logger.warn("RESEND_API_KEY not set — email not sent", {
      to: params.to,
      subject: params.subject,
    });
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("Resend API error", {
        status: response.status,
        error: errorText,
        to: params.to,
      });
      return false;
    }

    logger.info("Email sent", { to: params.to, subject: params.subject });
    return true;
  } catch (error) {
    logger.error("Failed to send email", {
      error: String(error),
      to: params.to,
    });
    return false;
  }
}
