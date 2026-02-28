import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";
import { runMigrations } from "./database/migrate.ts";
import { tools } from "./tools/index.ts";
import { type Env, StateSchema } from "./types/env.ts";

export type { Env };

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    state: StateSchema,
  },
  tools,
});

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

const internalDatabaseUrl = requireEnv("INTERNAL_DATABASE_URL");
const accessToken = requireEnv("MCP_ACCESS_TOKEN");
void internalDatabaseUrl;

function unauthorizedResponse(): Response {
  return new Response("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Bearer realm="mcp", charset="UTF-8"',
    },
  });
}

let migrationPromise: Promise<void> | null = null;

function ensureMigrations(): Promise<void> {
  if (!migrationPromise) {
    migrationPromise = runMigrations().catch((error) => {
      migrationPromise = null;
      throw error;
    });
  }

  return migrationPromise;
}

if (runtime.fetch) {
  serve(async (req, env, ctx) => {
    const requestToken = (env as Env).MESH_REQUEST_CONTEXT?.state
      ?.MCP_ACCESS_TOKEN;
    if (requestToken !== accessToken) {
      return unauthorizedResponse();
    }

    await ensureMigrations();
    return runtime.fetch(req, env, ctx);
  });
}
