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
import { tools } from "./tools/index.ts";
import { StateSchema, type Env, type Registry } from "./types/env.ts";

export { StateSchema };

// ── Startup diagnostics ──────────────────────────────────────────────────────
console.log("[Gateway] 🚀 Starting Deco AI Gateway...");
console.log(
  `[Gateway] 🔑 OPENROUTER_MANAGEMENT_KEY: ${process.env.OPENROUTER_MANAGEMENT_KEY ? "✅ set" : "❌ NOT SET"}`,
);
console.log(
  `[Gateway] 🗄️  SUPABASE_URL:             ${process.env.SUPABASE_URL ? "✅ set" : "❌ NOT SET"}`,
);
console.log(
  `[Gateway] 🗄️  SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? "✅ set" : "❌ NOT SET"}`,
);
console.log(
  `[Gateway] 🔒 ENCRYPTION_KEY:            ${process.env.ENCRYPTION_KEY ? "✅ set" : "❌ NOT SET"}`,
);
// ────────────────────────────────────────────────────────────────────────────

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

      console.log(
        `[Gateway] 🔔 onChange triggered — connectionId=${connectionId ?? "MISSING"}, orgId=${organizationId ?? "MISSING"}, orgName=${organizationName ?? "not set"}`,
      );

      if (!connectionId || !organizationId) {
        console.warn(
          "[Gateway] ⚠️  Cannot warm-up cache: connectionId or organizationId missing",
        );
        return;
      }

      // Warm-up: pre-load the key into memory cache so the first tool call
      // doesn't need to hit Supabase or OpenRouter.
      await ensureApiKey(
        connectionId,
        organizationId,
        meshUrl ?? "",
        organizationName,
      );
    },
  },
});

serve(runtime.fetch);
