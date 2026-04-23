/**
 * GitHub Webhook HTTP Handler
 *
 * Receives GitHub App webhook events, verifies signatures,
 * and routes them to the correct connection.
 */

import { getInstallationStore } from "./lib/installation-map.ts";
import { triggers } from "./lib/trigger-store.ts";
import { verifyGitHubWebhook } from "./lib/webhook.ts";
import type { Env } from "./types/env.ts";

export async function handleGitHubWebhook(
  req: Request,
  env: Env,
): Promise<Response> {
  const deliveryId = req.headers.get("x-github-delivery") || "unknown";
  const eventHeader = req.headers.get("x-github-event") || "unknown";
  const hookId = req.headers.get("x-github-hook-id") || "unknown";

  console.log(
    `[Webhook] ← delivery=${deliveryId} event=${eventHeader} hook=${hookId}`,
  );

  const rawBody = await req.text();
  const signatureHeader = req.headers.get("x-hub-signature-256");

  const { verified, payload } = await verifyGitHubWebhook(
    rawBody,
    signatureHeader,
    process.env.GITHUB_WEBHOOK_SECRET || "",
  );

  if (!verified || !payload) {
    console.warn(
      `[Webhook] ✗ delivery=${deliveryId} rejected: invalid signature (sig_present=${Boolean(
        signatureHeader,
      )}, body_bytes=${rawBody.length})`,
    );
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const installationId = payload.installation?.id;
  if (!installationId) {
    console.log(
      `[Webhook] ⚠ delivery=${deliveryId} skipped: no installation_id in payload`,
    );
    return Response.json({ ok: true, skipped: "no_installation_id" });
  }

  const store = getInstallationStore(env.INSTALLATIONS);
  const connectionId = await store.get(installationId);
  if (!connectionId) {
    console.log(
      `[Webhook] ⚠ delivery=${deliveryId} skipped: no mapping for installation=${installationId}`,
    );
    return Response.json({ ok: true, skipped: "no_mapping" });
  }

  const fullEventType = payload.action
    ? `github.${eventHeader}.${payload.action}`
    : `github.${eventHeader}`;

  const subject =
    payload.repository?.full_name || payload.organization?.login || "unknown";

  console.log(
    `[Webhook] → delivery=${deliveryId} event=${fullEventType} subject=${subject} ` +
      `installation=${installationId} connection=${connectionId} ` +
      `sender=${payload.sender?.login ?? "?"} action=${payload.action ?? "-"}`,
  );

  // Notify Mesh — the SDK handles credential lookup and delivery
  triggers.notify(
    connectionId,
    fullEventType as Parameters<typeof triggers.notify>[1],
    {
      event: fullEventType,
      subject,
      sender: payload.sender?.login,
      repository: payload.repository?.full_name,
      action: payload.action,
      payload,
    },
  );

  return Response.json({ ok: true, event: fullEventType, subject });
}
