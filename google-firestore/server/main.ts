/**
 * Google Firestore MCP: read Cloud Firestore (Firebase) databases over the
 * Firestore REST API with the caller's own Google account.
 *
 * Google's official remote MCP (firestore.googleapis.com/mcp) cannot be
 * connected from Studio: accounts.google.com has no dynamic client
 * registration, so Mesh has no way to log in. This server is the OAuth
 * front for it, like the other google-* MCPs, using the shared Google client.
 *
 * No `withAuth`: the Authorization header carries the caller's own Google
 * token and every tool forwards it to Google, so there is no shared secret to
 * check (see auth-exemptions.json). OAuth state/code are sealed with
 * OAUTH_STATE_SECRET and redirects are pinned to decocms.com.
 */
import { withRuntime } from "@decocms/runtime";
import { createGoogleOAuth } from "@decocms/mcps-shared/google-oauth";
import { serve } from "@decocms/mcps-shared/serve";

import { tools } from "./tools/index.ts";
import { type Env, StateSchema } from "./types/env.ts";

export type { Env };

export const GOOGLE_SCOPES = [
  // Firestore reads. There is no read-only Firestore scope: IAM on the
  // project (e.g. roles/datastore.viewer) is what limits the account.
  "https://www.googleapis.com/auth/datastore",
  // Listing Firebase projects (Firebase Management API).
  "https://www.googleapis.com/auth/cloud-platform.read-only",
];

const stateSecret = process.env.OAUTH_STATE_SECRET;
if (!stateSecret) {
  // Without it the runtime would hand Mesh the Google token in a plain base64 code.
  throw new Error(
    "OAUTH_STATE_SECRET is required (any long random string, e.g. openssl rand -hex 32).",
  );
}

/** Mesh/Studio callback hosts allowed to receive the authorization code. */
const allowedRedirectHosts = [
  "decocms.com",
  ...(process.env.EXTRA_ALLOWED_REDIRECT_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter((h) => h.includes(".")),
];

const runtime = withRuntime<Env, typeof StateSchema>({
  oauth: {
    ...createGoogleOAuth({ scopes: GOOGLE_SCOPES }),
    allowedRedirectHosts,
    stateSecret,
  },
  configuration: { state: StateSchema },
  tools,
});

serve(runtime.fetch);
