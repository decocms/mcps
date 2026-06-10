/**
 * Repo-grant storage + opaque refresh-token helpers.
 *
 * A synthetic refresh token is the stable opaque string `ghr_<grantId>.<secret>`.
 * Only the SHA-256 hash of <secret> is persisted; the plaintext is returned to
 * the caller exactly once. Grants are keyed by <grantId> in the REPO_GRANTS KV
 * namespace and verified with a constant-time hash comparison.
 */

import crypto from "node:crypto";
import {
  GRANT_KEY_PREFIX,
  GRANT_TTL_SECONDS,
  REFRESH_TOKEN_PREFIX,
} from "../constants.ts";

export interface RepoGrantMetadata {
  grantId: string;
  secretHash: string;
  installationId: number;
  repositoryId: number;
  owner: string;
  repo: string;
  permissions: Record<string, string>;
  createdAt: string;
  expiresAt: string | null;
  revokedAt?: string | null;
  createdByConnectionId?: string;
  clientId: string;
}

export interface NewGrantCredentials {
  grantId: string;
  secret: string;
  secretHash: string;
  refreshToken: string;
}

/** Generate a fresh grant id + 256-bit secret, plus the secret's hash and the
 * formatted opaque refresh token. */
export function generateGrantCredentials(): NewGrantCredentials {
  const grantId = crypto.randomBytes(16).toString("hex");
  const secret = crypto.randomBytes(32).toString("base64url");
  const secretHash = hashSecret(secret);
  return {
    grantId,
    secret,
    secretHash,
    refreshToken: formatRefreshToken(grantId, secret),
  };
}

/** SHA-256 of the secret, hex-encoded. */
export function hashSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

/** Constant-time comparison of a presented secret against a stored hash. */
export function verifySecret(secret: string, secretHash: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(secretHash)) return false;
  const a = Buffer.from(hashSecret(secret), "hex");
  const b = Buffer.from(secretHash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Opaque refresh token: `ghr_<grantId>.<secret>`. */
export function formatRefreshToken(grantId: string, secret: string): string {
  return `${REFRESH_TOKEN_PREFIX}${grantId}.${secret}`;
}

/** Parse `ghr_<grantId>.<secret>`; returns null if the shape is wrong. Splits
 * on the FIRST dot, so a base64url secret containing dots is preserved. */
export function parseRefreshToken(
  token: string,
): { grantId: string; secret: string } | null {
  if (!token.startsWith(REFRESH_TOKEN_PREFIX)) return null;
  const body = token.slice(REFRESH_TOKEN_PREFIX.length);
  const dot = body.indexOf(".");
  if (dot <= 0 || dot === body.length - 1) return null;
  const grantId = body.slice(0, dot);
  const secret = body.slice(dot + 1);
  if (!/^[0-9a-f]{32}$/.test(grantId)) return null;
  if (secret.length === 0) return null;
  return { grantId, secret };
}

// --- store interface + implementations come in Task 3 (same file) ---

const _keyOf = (grantId: string): string => `${GRANT_KEY_PREFIX}${grantId}`;
// _keyOf and GRANT_TTL_SECONDS are used by the store added in Task 3.
void _keyOf;
void GRANT_TTL_SECONDS;
