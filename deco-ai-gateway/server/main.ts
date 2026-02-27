/**
 * Deco AI Gateway MCP Server
 *
 * OpenRouter LLM binding with automatic API key provisioning per organization.
 * Each org that installs this MCP gets its own OpenRouter API key, stored
 * encrypted (AES-256-GCM) in Supabase for cost tracking and isolation.
 *
 * Key provisioning flow (lazy, on first tool call):
 * 1. Check in-memory cache (instant)
 * 2. Check Supabase — decrypt and cache
 * 3. Create via OpenRouter Provisioning API — encrypt, persist, cache
 */
import { serve } from "@decocms/mcps-shared/serve";
import { withRuntime } from "@decocms/runtime";
import { ensureApiKey } from "./lib/provisioning.ts";
import { logger } from "./lib/logger.ts";
import { confirmPaymentForConnection } from "./lib/confirm-payment-service.ts";
import { ALLOWED_REDIRECT_DOMAINS } from "./lib/constants.ts";
import { tools } from "./tools/index.ts";
import { StateSchema, type Env, type Registry } from "./types/env.ts";

export { StateSchema };

const REQUIRED_ENVS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENROUTER_MANAGEMENT_KEY",
];
for (const name of REQUIRED_ENVS) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}
if (!process.env.DECO_CRYPTO_KEY && !process.env.ENCRYPTION_KEY) {
  throw new Error(
    "Either DECO_CRYPTO_KEY or ENCRYPTION_KEY must be set for API key encryption",
  );
}

const encryptionKeySource = process.env.DECO_CRYPTO_KEY
  ? "DECO_CRYPTO_KEY"
  : process.env.ENCRYPTION_KEY
    ? "ENCRYPTION_KEY"
    : "missing";

// Always write startup info to stderr so it's captured even if stdout is not
process.stderr.write(
  JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "info",
    service: "deco-ai-gateway",
    body: "Server starting",
    OPENROUTER_MANAGEMENT_KEY: process.env.OPENROUTER_MANAGEMENT_KEY
      ? "set"
      : "missing",
    SUPABASE_URL: process.env.SUPABASE_URL ? "set" : "missing",
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
      ? "set"
      : "missing",
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ? "set" : "missing",
    encryptionKey: encryptionKeySource,
    HYPERDX_API_KEY: process.env.HYPERDX_API_KEY ? "set" : "missing",
    LOG_LEVEL: process.env.LOG_LEVEL ?? "info (default)",
  }) + "\n",
);

logger.info("Starting Deco AI Gateway", {
  OPENROUTER_MANAGEMENT_KEY: process.env.OPENROUTER_MANAGEMENT_KEY
    ? "set"
    : "missing",
  SUPABASE_URL: process.env.SUPABASE_URL ? "set" : "missing",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
    ? "set"
    : "missing",
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ? "set" : "missing",
  encryptionKey: encryptionKeySource,
  HYPERDX_API_KEY: process.env.HYPERDX_API_KEY ? "set" : "missing",
  LOG_LEVEL: process.env.LOG_LEVEL ?? "info (default)",
});

const runtime = withRuntime<Env, typeof StateSchema, Registry>({
  tools,
  configuration: {
    state: StateSchema,
    scopes: [],
    onChange: async (env) => {
      const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
      const organizationId = env.MESH_REQUEST_CONTEXT?.organizationId;
      const meshUrl = env.MESH_REQUEST_CONTEXT?.meshUrl;
      const organizationName =
        env.MESH_REQUEST_CONTEXT?.state?.ORGANIZATION_NAME;
      logger.info("onChange triggered", {
        connectionId,
        organizationId,
        organizationName,
      });

      if (!connectionId || !organizationId) {
        logger.warn(
          "Cannot warm-up cache: connectionId or organizationId missing",
        );
        return;
      }

      await ensureApiKey(
        connectionId,
        organizationId,
        meshUrl ?? "",
        organizationName,
      );
    },
  },
});

function htmlPage(title: string, message: string): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #fafafa; color: #111; }
    .card { text-align: center; padding: 3rem 2rem; background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.1); max-width: 420px; }
    h1 { font-size: 1.5rem; margin: 0 0 .5rem; }
    p { color: #555; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    },
  });
}

function safeRedirect(redirectParam: string | null): Response | null {
  if (!redirectParam) return null;
  try {
    const target = new URL(redirectParam);
    const host = target.hostname;
    const isAllowed =
      host === "localhost" ||
      ALLOWED_REDIRECT_DOMAINS.some(
        (d: string) => host === d || host.endsWith(`.${d}`),
      );
    if (!isAllowed) return null;
    return Response.redirect(target.toString(), 302);
  } catch {
    return null;
  }
}

const handler: typeof runtime.fetch = async (req, ...args) => {
  const url = new URL(req.url);

  if (url.pathname === "/payment/success") {
    const connectionId = url.searchParams.get("connection_id");
    if (connectionId) {
      const result = await confirmPaymentForConnection(connectionId);
      logger.info("Server-side payment confirmation result", {
        connectionId,
        status: result.status,
      });
    }
    const redirect = safeRedirect(url.searchParams.get("redirect"));
    if (redirect) return redirect;
    return htmlPage(
      "Payment Successful",
      "Your payment has been received. You can close this tab and return to your AI assistant.",
    );
  }

  if (url.pathname === "/payment/cancel") {
    const redirect = safeRedirect(url.searchParams.get("redirect"));
    if (redirect) return redirect;
    return htmlPage(
      "Payment Cancelled",
      "The payment was cancelled. You can close this tab and try again later.",
    );
  }

  return runtime.fetch(req, ...args);
};

serve(handler);
