/**
 * Figma MCP — design context for coding agents over the Figma REST API.
 *
 * Each user connects their own Figma account (OAuth). Tools mirror the names
 * of Figma's official MCP server for the read side (design to code, design
 * system, Code Connect); creating or editing layers needs the Plugin API,
 * which REST does not offer, so code-to-design tools are not here.
 *
 * No `withAuth`: the Authorization header carries the caller's own Figma
 * token and every tool forwards it to api.figma.com, so there is no shared
 * secret to check and no server-side credential to protect (see
 * auth-exemptions.json). The OAuth state/code is sealed with
 * OAUTH_STATE_SECRET and redirects are pinned to decocms.com.
 */
import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";

import { authorizationUrl, exchangeCode, refreshToken } from "./lib/oauth.ts";
import { prompts, tools } from "./tools/index.ts";
import { type Env, StateSchema } from "./types/env.ts";

export type { Env };

const stateSecret = process.env.OAUTH_STATE_SECRET;
if (!stateSecret) {
  // Without it the runtime would hand Mesh the Figma token in a plain base64 code.
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
    mode: "PKCE",
    authorizationServer: "https://www.figma.com",
    allowedRedirectHosts,
    stateSecret,
    authorizationUrl,
    exchangeCode,
    refreshToken,
  },
  configuration: { state: StateSchema },
  tools,
  prompts,
});

serve(runtime.fetch);
