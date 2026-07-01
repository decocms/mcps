import type { Env } from "../../shared/deco.gen.ts";

export const getGoogleAccessToken = (env: Env): string => {
  const authorization = env.MESH_REQUEST_CONTEXT?.authorization;
  if (!authorization) {
    throw new Error(
      "Not authenticated. Please authorize with Google Analytics first.",
    );
  }
  return authorization.replace(/^Bearer\s+/i, "");
};

// Normalizes "1234567" → "properties/1234567"; already-prefixed IDs pass through.
function normalizePropertyId(id: string): string {
  const clean = String(id).trim();
  return /^\d+$/.test(clean) ? `properties/${clean}` : clean;
}

/**
 * Returns the normalized allowlist of property IDs for this installation,
 * or null if no allowlist is configured (meaning all properties are allowed).
 */
export const getAllowedPropertyIds = (env: Env): string[] | null => {
  const ids = env.MESH_REQUEST_CONTEXT?.state?.allowedPropertyIds;
  if (!ids || ids.length === 0) return null;
  return ids.map(normalizePropertyId);
};

/**
 * Resolves the GA4 property to use for a request.
 *
 * Prefers the `property` passed to the tool; when omitted, falls back to the
 * `propertyId` configured on the MCP installation state. If an allowlist is
 * configured, the resolved property must be in it.
 */
export const resolveProperty = (env: Env, property?: string | null): string => {
  const resolved = property ?? env.MESH_REQUEST_CONTEXT?.state?.propertyId;
  if (!resolved) {
    throw new Error(
      "No GA4 property provided. Pass a `property` argument or configure a default `propertyId` in this integration's settings.",
    );
  }
  const normalized = normalizePropertyId(resolved);
  const allowed = getAllowedPropertyIds(env);
  if (allowed && !allowed.includes(normalized)) {
    throw new Error(
      `Property "${normalized}" is not allowed for this integration. Allowed properties: ${allowed.join(", ")}.`,
    );
  }
  return normalized;
};
