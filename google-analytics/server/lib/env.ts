import type { Env } from "../../shared/deco.gen.ts";
import type { GaClient } from "./ga-client.ts";

export const getGoogleAccessToken = (env: Env): string => {
  const authorization = env.MESH_REQUEST_CONTEXT?.authorization;
  if (!authorization) {
    throw new Error(
      "Not authenticated. Please authorize with Google Analytics first.",
    );
  }
  return authorization.replace(/^Bearer\s+/i, "");
};

// Normalizes "1234567" → "accounts/1234567"; already-prefixed IDs pass through.
function normalizeAccountId(id: string): string {
  const clean = String(id).trim();
  return /^\d+$/.test(clean) ? `accounts/${clean}` : clean;
}

/**
 * Returns the normalized allowlist of account IDs for this installation,
 * or null if no allowlist is configured (meaning all accounts are allowed).
 */
export const getAllowedAccountIds = (env: Env): string[] | null => {
  const ids = env.MESH_REQUEST_CONTEXT?.state?.allowedAccountIds;
  if (!ids || ids.length === 0) return null;
  return ids.map(normalizeAccountId);
};

/**
 * Resolves the GA4 property to use for a request and enforces account-level
 * access control when allowedAccountIds is configured.
 *
 * Prefers the `property` passed to the tool; when omitted, falls back to the
 * `propertyId` configured on the MCP installation state.
 *
 * When an allowlist is configured, fetches the property's parent account from
 * the GA4 Admin API and rejects requests for properties outside allowed accounts.
 */
export const resolveProperty = async (
  env: Env,
  client: GaClient,
  property?: string | null,
): Promise<string> => {
  const resolved = property ?? env.MESH_REQUEST_CONTEXT?.state?.propertyId;
  if (!resolved) {
    throw new Error(
      "No GA4 property provided. Pass a `property` argument or configure a default `propertyId` in this integration's settings.",
    );
  }

  const allowed = getAllowedAccountIds(env);
  if (allowed) {
    const prop = (await client.getProperty(resolved)) as { parent?: string };
    const parentAccount = prop.parent;
    if (!parentAccount || !allowed.includes(parentAccount)) {
      throw new Error(
        `Access denied: property "${resolved}" does not belong to an allowed account.`,
      );
    }
  }

  return resolved;
};
