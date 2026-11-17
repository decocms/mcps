import { AsyncLocalStorage } from "node:async_hooks";
import type { Env } from "../types/env.ts";

type State = NonNullable<Env["MESH_REQUEST_CONTEXT"]>["state"];

const requestHeaders = new AsyncLocalStorage<Headers>();

export const withRequestHeaders = <T>(headers: Headers, fn: () => T): T =>
  requestHeaders.run(headers, fn);

/**
 * Configuration headers for clients that connect directly (Claude, Copilot,
 * Cursor) instead of through Studio, which sends the state in x-mesh-token.
 */
export const CONFIG_HEADERS = {
  region: "x-dy-region",
  sectionId: "x-dy-section-id",
  adminEmail: "x-dy-admin-email",
  adminPassword: "x-dy-admin-password",
  adminSession: "x-dy-admin-session",
  profileAnywhereKey: "x-dy-profile-anywhere-key",
} as const;

/** Studio state wins; headers fill whatever it leaves empty. */
export function withHeaderConfig(env: Env): Env {
  const headers = requestHeaders.getStore();
  const context = env.MESH_REQUEST_CONTEXT;
  if (!headers || !context) return env;
  const fromHeaders: Record<string, string> = {};
  for (const [key, header] of Object.entries(CONFIG_HEADERS)) {
    const value = headers.get(header);
    if (value) fromHeaders[key] = value;
  }
  if (fromHeaders.region && !["us", "eu"].includes(fromHeaders.region)) {
    throw new Error(`${CONFIG_HEADERS.region} must be "us" or "eu".`);
  }
  const state = Object.fromEntries(
    Object.entries(context.state ?? {}).filter(
      ([, v]) => v !== undefined && v !== "",
    ),
  );
  return {
    ...env,
    MESH_REQUEST_CONTEXT: {
      ...context,
      state: { ...fromHeaders, ...state } as State,
    },
  };
}
