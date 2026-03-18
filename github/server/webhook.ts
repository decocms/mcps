/**
 * GitHub Webhook HTTP Handler
 *
 * Receives GitHub App webhook events, verifies signatures,
 * and routes them to the correct connection.
 */

import { getConnectionForInstallation } from "./lib/installation-map.ts";
import { verifyGitHubWebhook } from "./lib/webhook.ts";
import { hasMatchingTrigger } from "./lib/trigger-store.ts";

const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || "";

export async function handleGitHubWebhook(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("x-hub-signature-256");

  const { verified, payload } = await verifyGitHubWebhook(
    rawBody,
    signatureHeader,
    GITHUB_WEBHOOK_SECRET,
  );

  if (!verified || !payload) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const installationId = payload.installation?.id;
  if (!installationId) {
    console.log("[Webhook] No installation.id in payload, skipping");
    return Response.json({ ok: true, skipped: "no_installation_id" });
  }

  const connectionId = getConnectionForInstallation(installationId);
  if (!connectionId) {
    console.log(`[Webhook] No mapping for installation ${installationId}`);
    return Response.json({ ok: true, skipped: "no_mapping" });
  }

  const eventType = req.headers.get("x-github-event") || "unknown";
  const fullEventType = payload.action
    ? `github.${eventType}.${payload.action}`
    : `github.${eventType}`;

  const subject =
    payload.repository?.full_name || payload.organization?.login || "unknown";

  console.log(
    `[Webhook] ${fullEventType} | subject=${subject} | connection=${connectionId} | sender=${payload.sender?.login}`,
  );

  if (
    hasMatchingTrigger(
      fullEventType,
      payload.repository?.full_name,
      connectionId,
    )
  ) {
    console.log(
      `[Webhook] TRIGGER MATCHED: ${fullEventType} | connection=${connectionId} | installation=${installationId}`,
    );
  }

  return Response.json({ ok: true, event: fullEventType, subject });
}
