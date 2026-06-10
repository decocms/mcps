/**
 * Synthetic repo-grant OAuth flow.
 *
 * - issueRepoGrant: persist a durable grant from a freshly minted token and
 *   return the opaque refresh token + endpoint metadata (used by MINT_REPO_TOKEN).
 * - mintRepoTokenWithGrant: the full MINT_REPO_TOKEN orchestration (Task 6).
 * - refreshRepoGrant / revokeRepoGrant + HTTP adapters (Tasks 7-8).
 *
 * Refresh redeems a grant using ONLY GitHub App credentials — no user-to-server
 * token. GitHub's own 422/404 means the grant is permanently invalid; outages
 * and our own misconfiguration are transient and must NOT invalidate the grant.
 */

import {
  DEFAULT_PUBLIC_BASE_URL,
  GRANT_TTL_SECONDS,
  REPO_GRANT_TOKEN_PATH,
} from "../constants.ts";
import {
  createAppJWT,
  GitHubAppApiError,
  mintInstallationAccessToken,
} from "./github-app-auth.ts";
import {
  generateGrantCredentials,
  getRepoGrantStore,
  parseRefreshToken,
  type RepoGrantMetadata,
  type RepoGrantStore,
  verifySecret,
} from "./repo-grant-store.ts";
import { mintRepoScopedToken } from "./repo-token.ts";
import type { Env } from "../types/env.ts";

export interface IssuedRepoGrant {
  refreshToken: string;
  tokenEndpoint: string;
  clientId: string;
  refreshTokenExpiresAt: string;
}

/** Create and persist a grant, returning the opaque refresh token + endpoint
 * metadata to embed in the MINT_REPO_TOKEN response. */
export async function issueRepoGrant(opts: {
  store: RepoGrantStore;
  installationId: number;
  repositoryId: number;
  owner: string;
  repo: string;
  permissions: Record<string, string>;
  clientId: string;
  baseUrl: string;
  createdByConnectionId?: string;
  now?: number;
}): Promise<IssuedRepoGrant> {
  const now = opts.now ?? Date.now();
  const { grantId, secretHash, refreshToken } = generateGrantCredentials();
  const expiresAt = new Date(now + GRANT_TTL_SECONDS * 1000).toISOString();

  const meta: RepoGrantMetadata = {
    grantId,
    secretHash,
    installationId: opts.installationId,
    repositoryId: opts.repositoryId,
    owner: opts.owner,
    repo: opts.repo,
    permissions: opts.permissions,
    createdAt: new Date(now).toISOString(),
    expiresAt,
    revokedAt: null,
    createdByConnectionId: opts.createdByConnectionId,
    clientId: opts.clientId,
  };
  await opts.store.create(meta);

  return {
    refreshToken,
    // Strip a trailing slash so a misconfigured PUBLIC_BASE_URL can't yield a
    // double-slash endpoint the mesh would fail to call.
    tokenEndpoint: `${opts.baseUrl.replace(/\/+$/, "")}${REPO_GRANT_TOKEN_PATH}`,
    clientId: opts.clientId,
    refreshTokenExpiresAt: expiresAt,
  };
}

export interface MintRepoTokenWithGrantResult {
  token: string;
  expiresAt: string;
  expiresIn: number;
  tokenType: "Bearer";
  permissions: Record<string, string>;
  repository: { id: number; owner: string; name: string };
  installationId: number;
  refreshToken: string;
  tokenEndpoint: string;
  clientId: string;
  refreshTokenExpiresAt: string;
}

/** Mint a short-lived repo-scoped token AND issue a durable refresh grant.
 * This is the orchestration behind the MINT_REPO_TOKEN tool. */
export async function mintRepoTokenWithGrant(opts: {
  callerToken: string;
  installationId: number;
  owner: string;
  repo: string;
  permissions?: Record<string, string>;
  repositoryId?: number;
  clientId: string;
  baseUrl: string;
  store: RepoGrantStore;
  createdByConnectionId?: string;
  jwt?: string;
  now?: number;
}): Promise<MintRepoTokenWithGrantResult> {
  const now = opts.now ?? Date.now();

  const minted = await mintRepoScopedToken({
    callerToken: opts.callerToken,
    installationId: opts.installationId,
    owner: opts.owner,
    repo: opts.repo,
    permissions: opts.permissions,
    repositoryId: opts.repositoryId,
    jwt: opts.jwt,
  });

  const issued = await issueRepoGrant({
    store: opts.store,
    installationId: minted.installationId,
    repositoryId: minted.repositoryId,
    owner: minted.repository.owner,
    repo: minted.repository.name,
    permissions: minted.permissions,
    clientId: opts.clientId,
    baseUrl: opts.baseUrl,
    createdByConnectionId: opts.createdByConnectionId,
    now,
  });

  const expiresIn = Math.max(
    0,
    Math.floor((Date.parse(minted.expiresAt) - now) / 1000),
  );

  return {
    token: minted.token,
    expiresAt: minted.expiresAt,
    expiresIn,
    tokenType: "Bearer",
    permissions: minted.permissions,
    repository: {
      id: minted.repositoryId,
      owner: minted.repository.owner,
      name: minted.repository.name,
    },
    installationId: minted.installationId,
    refreshToken: issued.refreshToken,
    tokenEndpoint: issued.tokenEndpoint,
    clientId: issued.clientId,
    refreshTokenExpiresAt: issued.refreshTokenExpiresAt,
  };
}

export interface OAuthTokenSuccess {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export type RefreshResult =
  | { ok: true; success: OAuthTokenSuccess; newExpiresAt: string }
  | { ok: false; status: number; error: string; error_description: string };

const INVALID_GRANT_MESSAGE =
  "Repo grant is expired, revoked, unknown, or no longer valid.";

function oauthError(
  status: number,
  error: string,
  error_description: string,
): RefreshResult {
  return { ok: false, status, error, error_description };
}

/** Map a mint failure to a transient-vs-permanent OAuth error. Permanent
 * (422/404) means the grant can never work again; everything else (outage,
 * rate limit, our own bad App key → 401/403) is transient and must NOT cause
 * the mesh to discard a valid grant. */
function mapRefreshMintError(err: unknown): RefreshResult {
  if (
    err instanceof GitHubAppApiError &&
    (err.status === 422 || err.status === 404)
  ) {
    return oauthError(400, "invalid_grant", INVALID_GRANT_MESSAGE);
  }
  return oauthError(
    503,
    "temporarily_unavailable",
    "Token service is temporarily unavailable. Please retry.",
  );
}

/** Redeem a synthetic refresh token for a fresh repo-scoped installation token.
 * Uses ONLY GitHub App credentials — no user-to-server token. */
export async function refreshRepoGrant(opts: {
  store: RepoGrantStore;
  grantType: string | null;
  refreshToken: string | null;
  clientId: string | null;
  expectedClientId: string;
  now?: number;
  jwt?: string;
}): Promise<RefreshResult> {
  const now = opts.now ?? Date.now();

  // --- request validation (client errors; not grant invalidation) ---
  if (!opts.grantType || !opts.refreshToken) {
    return oauthError(
      400,
      "invalid_request",
      "Both grant_type and refresh_token are required.",
    );
  }
  if (opts.grantType !== "refresh_token") {
    return oauthError(
      400,
      "unsupported_grant_type",
      `grant_type "${opts.grantType}" is not supported; use refresh_token.`,
    );
  }
  // Public-client model: the 256-bit grant secret is the real credential, so
  // client_id is OPTIONAL. We reject only a client_id that is present AND wrong
  // (a cheap consistency safeguard); an omitted client_id is allowed by design.
  if (
    opts.clientId &&
    opts.expectedClientId &&
    opts.clientId !== opts.expectedClientId
  ) {
    return oauthError(400, "invalid_client", "Unknown client_id.");
  }

  // --- grant lookup + constant-time secret verification (permanent) ---
  const parsed = parseRefreshToken(opts.refreshToken);
  if (!parsed) return oauthError(400, "invalid_grant", INVALID_GRANT_MESSAGE);

  let grant: RepoGrantMetadata | undefined;
  try {
    grant = await opts.store.get(parsed.grantId);
  } catch {
    return oauthError(
      503,
      "temporarily_unavailable",
      "Grant storage is temporarily unavailable. Please retry.",
    );
  }

  if (
    !grant ||
    grant.revokedAt ||
    !verifySecret(parsed.secret, grant.secretHash)
  ) {
    return oauthError(400, "invalid_grant", INVALID_GRANT_MESSAGE);
  }
  if (grant.expiresAt && Date.parse(grant.expiresAt) <= now) {
    try {
      await opts.store.revoke(grant.grantId);
    } catch {
      // best-effort cleanup
    }
    return oauthError(400, "invalid_grant", INVALID_GRANT_MESSAGE);
  }

  // --- re-mint ---
  let jwt: string;
  try {
    jwt = opts.jwt ?? createAppJWT();
  } catch {
    // App credentials misconfigured: our fault, not the grant's. Transient.
    return oauthError(
      503,
      "temporarily_unavailable",
      "Token service is temporarily unavailable. Please retry.",
    );
  }

  let minted;
  try {
    minted = await mintInstallationAccessToken(
      grant.installationId,
      { repository_ids: [grant.repositoryId], permissions: grant.permissions },
      jwt,
    );
  } catch (err) {
    const mapped = mapRefreshMintError(err);
    // On a permanent (grant-invalidating) error, best-effort delete the grant.
    if (
      !mapped.ok &&
      mapped.status === 400 &&
      mapped.error === "invalid_grant"
    ) {
      try {
        await opts.store.revoke(grant.grantId);
      } catch {
        // best-effort
      }
    }
    return mapped;
  }

  // --- slide TTL and respond ---
  const newExpiresAt = new Date(now + GRANT_TTL_SECONDS * 1000).toISOString();
  try {
    await opts.store.touch(grant.grantId, newExpiresAt);
  } catch {
    // Non-fatal: the access token is already minted.
  }

  const expiresIn = Math.max(
    0,
    Math.floor((Date.parse(minted.expires_at) - now) / 1000),
  );

  return {
    ok: true,
    newExpiresAt,
    success: {
      access_token: minted.token,
      token_type: "Bearer",
      expires_in: expiresIn,
      refresh_token: opts.refreshToken,
      scope: `github-app-installation:${grant.installationId} repo:${grant.owner}/${grant.repo}`,
    },
  };
}

/** RFC 7009-style revoke. Always 200 (even for unknown/malformed tokens) to
 * avoid leaking token validity; only storage failure surfaces as 503. */
export async function revokeRepoGrant(opts: {
  store: RepoGrantStore;
  token: string | null;
}): Promise<{ status: number; body?: { error: string } }> {
  if (!opts.token) return { status: 200 };
  const parsed = parseRefreshToken(opts.token);
  if (!parsed) return { status: 200 };
  try {
    await opts.store.revoke(parsed.grantId);
  } catch {
    return { status: 503, body: { error: "temporarily_unavailable" } };
  }
  return { status: 200 };
}

const NO_STORE: Record<string, string> = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
};
const JSON_NO_STORE: Record<string, string> = {
  ...NO_STORE,
  "Content-Type": "application/json",
};

/** These endpoints are public/unauthenticated and only ever receive a few
 * small form fields. Reject an over-sized body via Content-Length before
 * buffering it, so a hostile caller can't amplify memory/CPU per request. */
const MAX_FORM_BYTES = 8192;

function bodyTooLarge(req: Request): boolean {
  const len = Number(req.headers.get("content-length") ?? "0");
  return Number.isFinite(len) && len > MAX_FORM_BYTES;
}

async function readForm(req: Request): Promise<URLSearchParams> {
  return new URLSearchParams(await req.text());
}

function clientIdOf(env: Env): string {
  return env.GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID || "";
}

function baseUrlOf(env: Env): string {
  return (
    env.PUBLIC_BASE_URL ||
    process.env.PUBLIC_BASE_URL ||
    DEFAULT_PUBLIC_BASE_URL
  );
}

/** Re-export so MINT_REPO_TOKEN can resolve the public base URL the same way. */
export { baseUrlOf as repoGrantBaseUrl, clientIdOf as repoGrantClientId };

/** POST /repo-grant/token — OAuth refresh_token grant. */
export async function handleRepoGrantTokenRequest(
  req: Request,
  env: Env,
  deps: { jwt?: string; now?: number } = {},
): Promise<Response> {
  if (bodyTooLarge(req)) {
    return new Response(
      JSON.stringify({
        error: "invalid_request",
        error_description: "Request body too large.",
      }),
      { status: 413, headers: JSON_NO_STORE },
    );
  }
  const form = await readForm(req);
  const result = await refreshRepoGrant({
    store: getRepoGrantStore(env.REPO_GRANTS),
    grantType: form.get("grant_type"),
    refreshToken: form.get("refresh_token"),
    clientId: form.get("client_id"),
    expectedClientId: clientIdOf(env),
    jwt: deps.jwt,
    now: deps.now,
  });

  if (result.ok) {
    return new Response(JSON.stringify(result.success), {
      status: 200,
      headers: JSON_NO_STORE,
    });
  }
  return new Response(
    JSON.stringify({
      error: result.error,
      error_description: result.error_description,
    }),
    { status: result.status, headers: JSON_NO_STORE },
  );
}

/** POST /repo-grant/revoke — RFC 7009 token revocation. */
export async function handleRepoGrantRevokeRequest(
  req: Request,
  env: Env,
): Promise<Response> {
  if (bodyTooLarge(req)) {
    return new Response(null, { status: 413, headers: NO_STORE });
  }
  const form = await readForm(req);
  const result = await revokeRepoGrant({
    store: getRepoGrantStore(env.REPO_GRANTS),
    token: form.get("token"),
  });
  return new Response(result.body ? JSON.stringify(result.body) : null, {
    status: result.status,
    headers: result.body ? JSON_NO_STORE : NO_STORE,
  });
}
