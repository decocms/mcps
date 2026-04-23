/**
 * GitHub Webhook HTTP Handler
 *
 * Receives GitHub App webhook events, verifies signatures,
 * and routes them to the correct connection.
 */

import { getInstallationStore } from "./lib/installation-map.ts";
import { verifyGitHubWebhook } from "./lib/webhook.ts";
import type { Env } from "./types/env.ts";

interface CallbackCredentials {
  callbackUrl: string;
  callbackToken: string;
}

interface TriggerState {
  credentials: CallbackCredentials;
  activeTriggerTypes: string[];
}

/**
 * Direct delivery to Mesh, awaitable (unlike `triggers.notify()` which
 * is fire-and-forget and loses in-flight fetches once the Worker response
 * returns). Reads trigger credentials from the same KV the trigger SDK
 * writes to (`triggers:${connectionId}`).
 */
async function deliverToMesh(
  env: Env,
  connectionId: string,
  type: string,
  data: Record<string, unknown>,
  deliveryId: string,
): Promise<void> {
  if (!env.INSTALLATIONS) {
    console.warn(
      `[Webhook] ⚠ delivery=${deliveryId} no INSTALLATIONS binding — skipping mesh notify`,
    );
    return;
  }

  const raw = await env.INSTALLATIONS.get(`triggers:${connectionId}`);
  if (!raw) {
    console.log(
      `[Webhook] ⚠ delivery=${deliveryId} no trigger credentials for connection=${connectionId} — skipping mesh notify`,
    );
    return;
  }

  let state: TriggerState;
  try {
    state = JSON.parse(raw) as TriggerState;
  } catch (err) {
    console.error(
      `[Webhook] ✗ delivery=${deliveryId} corrupted trigger state for connection=${connectionId}:`,
      err,
    );
    return;
  }

  try {
    const res = await fetch(state.credentials.callbackUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.credentials.callbackToken}`,
      },
      body: JSON.stringify({ type, data }),
    });
    if (!res.ok) {
      console.error(
        `[Webhook] ✗ delivery=${deliveryId} mesh callback returned ${res.status} ${res.statusText}`,
      );
    } else {
      console.log(
        `[Webhook] ✓ delivery=${deliveryId} mesh callback delivered (${res.status})`,
      );
    }
  } catch (err) {
    console.error(
      `[Webhook] ✗ delivery=${deliveryId} mesh callback fetch failed:`,
      err,
    );
  }
}

export async function handleGitHubWebhook(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
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

  // Hand the delivery to Workers' post-response task queue so it isn't
  // cancelled when we return below. On local dev (no ctx.waitUntil) we
  // just let it run — Bun/Node won't terminate the process mid-fetch.
  const deliveryPromise = deliverToMesh(
    env,
    connectionId,
    fullEventType,
    {
      event: fullEventType,
      subject,
      sender: payload.sender?.login,
      // `repo` is the canonical key — matches the trigger params schema
      // defined in trigger-store.ts (`z.object({ repo: z.string() })`) so
      // Mesh's paramsMatch (strict `data[key] === value`) can filter by
      // repository. `repository` is kept as an alias for payload clarity.
      repo: payload.repository?.full_name,
      repository: payload.repository?.full_name,
      action: payload.action,
      payload,
    },
    deliveryId,
  );
  ctx.waitUntil(deliveryPromise);

  return Response.json({ ok: true, event: fullEventType, subject });
}
