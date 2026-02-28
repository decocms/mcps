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
  });
}

function isPublicRequest(req: Request): boolean {
  return (
    req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS"
  );
}

const PUBLIC_MCP_METHODS = new Set<string>([
  "initialize",
  "notifications/initialized",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPublicRpcMethod(method: string): boolean {
  return PUBLIC_MCP_METHODS.has(method);
}

function extractRpcMethods(payload: unknown): string[] | null {
  if (Array.isArray(payload)) {
    const methods: string[] = [];
    for (const item of payload) {
      if (!isRecord(item) || typeof item.method !== "string") {
        return null;
      }
      methods.push(item.method);
    }
    return methods;
  }

  if (isRecord(payload) && typeof payload.method === "string") {
    return [payload.method];
  }

  return null;
}

async function isPublicMcpRequest(req: Request): Promise<boolean> {
  if (isPublicRequest(req)) {
    return true;
  }

  if (req.method !== "POST") {
    return false;
  }

  const cloned = req.clone();
  const rawBody = await cloned.text();
  if (!rawBody) {
    return false;
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return false;
  }

  const methods = extractRpcMethods(payload);
  if (!methods || methods.length === 0) {
    return false;
  }

  return methods.every(isPublicRpcMethod);
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
    if (await isPublicMcpRequest(req)) {
      return runtime.fetch(req, env, ctx);
    }

    const requestToken = (env as Env).MESH_REQUEST_CONTEXT?.state
      ?.MCP_ACCESS_TOKEN;
    if (requestToken !== accessToken) {
      return unauthorizedResponse();
    }

    await ensureMigrations();
    return runtime.fetch(req, env, ctx);
  });
}
