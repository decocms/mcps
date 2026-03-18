import type { Env } from "../types/env.ts";

export function getApiToken(env: Env): string {
  const token = env.MESH_REQUEST_CONTEXT?.state?.apiToken;
  if (!token) {
    throw new Error(
      "Missing VWO API token. Please configure it in the MCP settings.",
    );
  }
  return token;
}

export function getAccountId(env: Env, override?: string): string {
  const id = override || env.MESH_REQUEST_CONTEXT?.state?.accountId;
  if (!id) {
    throw new Error(
      "Account ID is required. Provide it as a parameter or configure it in the MCP settings.",
    );
  }
  return id;
}
