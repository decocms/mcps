/**
 * Gmail MCP Server
 *
 * This MCP provides tools for interacting with Gmail API,
 * including message management, thread operations, labels, and drafts.
 *
 * Deployed as a Cloudflare Worker with KV for email→connection mappings.
 */
import { withRuntime } from "@decocms/runtime";
import { createGoogleOAuth } from "@decocms/mcps-shared/google-oauth";

import { tools } from "./tools/index.ts";
import { ENDPOINTS, GOOGLE_SCOPES } from "./constants.ts";
import type { Env } from "../shared/deco.gen.ts";
import {
  setEmailMapping,
  removeConnectionMappings,
} from "./lib/email-connection-map.ts";
import { handleGmailWebhook } from "./webhook.ts";

export type { Env };

const runtime = withRuntime<Env>({
  tools,
  oauth: createGoogleOAuth({
    scopes: [
      GOOGLE_SCOPES.GMAIL_READONLY,
      GOOGLE_SCOPES.GMAIL_SEND,
      GOOGLE_SCOPES.GMAIL_MODIFY,
      GOOGLE_SCOPES.GMAIL_LABELS,
    ],
  }),
  configuration: {
    onChange: async (env) => {
      const token = env.MESH_REQUEST_CONTEXT?.authorization;
      const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
      if (!token || !connectionId) return;

      const accessToken = token.replace(/^Bearer\s+/i, "");
      const kv = env.EMAIL_MAP;

      try {
        const profileRes = await fetch(ENDPOINTS.PROFILE, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!profileRes.ok) {
          console.error(
            `[Gmail onChange] Failed to fetch profile: ${profileRes.status}`,
          );
          return;
        }

        const profile = (await profileRes.json()) as {
          emailAddress: string;
          historyId: string;
        };

        await removeConnectionMappings(kv, connectionId);
        await setEmailMapping(kv, profile.emailAddress, connectionId);
        console.log(
          `[Gmail onChange] Mapped ${profile.emailAddress} → ${connectionId}`,
        );

        const pubsubTopic = process.env.GMAIL_PUBSUB_TOPIC || "";
        if (pubsubTopic) {
          const watchRes = await fetch(ENDPOINTS.WATCH, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              topicName: pubsubTopic,
              labelIds: ["INBOX"],
            }),
          });

          if (watchRes.ok) {
            const watchData = (await watchRes.json()) as {
              historyId: string;
              expiration: string;
            };
            console.log(
              `[Gmail onChange] Watch registered for ${profile.emailAddress}, expires ${watchData.expiration}`,
            );
          } else {
            const error = await watchRes.text();
            console.error(
              `[Gmail onChange] Failed to register watch: ${watchRes.status} - ${error}`,
            );
          }
        }
      } catch (error) {
        console.error("[Gmail onChange] Error:", error);
      }
    },
  },
});

/**
 * Wrap runtime.fetch to intercept Gmail webhook requests.
 */
const wrappedFetch: typeof runtime.fetch = async (req, env, ctx) => {
  const url = new URL(req.url);

  if (req.method === "POST" && url.pathname.startsWith("/webhooks/gmail")) {
    const webhookSecret = process.env.GMAIL_WEBHOOK_SECRET || "";
    return handleGmailWebhook(req, env.EMAIL_MAP, webhookSecret);
  }

  return runtime.fetch(req, env, ctx);
};

export default { fetch: wrappedFetch };
