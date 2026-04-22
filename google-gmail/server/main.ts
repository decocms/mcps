/**
 * Gmail MCP Server
 *
 * This MCP provides tools for interacting with Gmail API,
 * including message management, thread operations, labels, and drafts.
 */
import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";
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

const GMAIL_PUBSUB_TOPIC = process.env.GMAIL_PUBSUB_TOPIC || "";

const runtime = withRuntime<Env>({
  tools: tools as any,
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

      // Strip Bearer prefix if present
      const accessToken = token.replace(/^Bearer\s+/i, "");

      try {
        // Fetch user profile to get email address
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

        // Map email → connectionId
        removeConnectionMappings(connectionId);
        setEmailMapping(profile.emailAddress, connectionId);
        console.log(
          `[Gmail onChange] Mapped ${profile.emailAddress} → ${connectionId}`,
        );

        // Set up Gmail push notifications via users.watch()
        if (GMAIL_PUBSUB_TOPIC) {
          const watchRes = await fetch(ENDPOINTS.WATCH, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              topicName: GMAIL_PUBSUB_TOPIC,
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

  if (req.method === "POST" && url.pathname === "/webhooks/gmail") {
    return handleGmailWebhook(req);
  }

  return runtime.fetch(req, env, ctx);
};

serve(wrappedFetch);
