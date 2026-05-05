import type { Env } from "../types/env.ts";

function readState(env: Env | undefined, key: string): string | undefined {
  const state = env?.MESH_REQUEST_CONTEXT?.state as
    | Record<string, unknown>
    | undefined;
  const value = state?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readEnvVar(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export function getTrackingKey(env?: Env): string {
  const key =
    readEnvVar("CRAZY_EGG_TRACKING_KEY") ??
    readState(env, "CRAZY_EGG_TRACKING_KEY");
  if (key) return key;
  throw new Error(
    "CRAZY_EGG_TRACKING_KEY is not configured. Find it in your Crazy Egg dashboard at Site Settings → API, then set it in the MCP configuration.",
  );
}

export function getApiKey(env?: Env): string {
  const key =
    readEnvVar("CRAZY_EGG_API_KEY") ?? readState(env, "CRAZY_EGG_API_KEY");
  if (key) return key;
  throw new Error(
    "CRAZY_EGG_API_KEY is not configured. Get it from app.crazyegg.com/options/api (Pro plan) and set it in the MCP configuration.",
  );
}

export function getAppKey(env?: Env): string {
  const key =
    readEnvVar("CRAZY_EGG_APP_KEY") ?? readState(env, "CRAZY_EGG_APP_KEY");
  if (key) return key;
  throw new Error(
    "CRAZY_EGG_APP_KEY is not configured. This is the App Key (HMAC signing secret) paired with your API key, found at app.crazyegg.com/options/api.",
  );
}
