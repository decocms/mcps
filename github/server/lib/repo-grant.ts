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
import {
  capPermissions,
  mintRepoScopedToken,
  OPTIONAL_READ_UPGRADES,
} from "./repo-token.ts";
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

/** Whole seconds until an ISO timestamp, floored at 0. Returns 0 (not NaN) for
 * an unparseable value — `Math.max(0, NaN)` is NaN, which would serialize
 * `expires_in` to null and break the OAuth numeric contract. */
function secondsUntil(iso: string, now: number): number {
  const secs = Math.floor((Date.parse(iso) - now) / 1000);
  return Number.isFinite(secs) ? Math.max(0, secs) : 0;
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

  const expiresIn = secondsUntil(minted.expiresAt, now);

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

const samePermissions = (
  a: Record<string, string>,
  b: Record<string, string>,
): boolean => {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k])
  );
};

/**
 * The permission maps a refresh tries, in order, when re-minting a grant.
 *
 * Rung 0 widens the grant into every {@link OPTIONAL_READ_UPGRADES} permission
 * — `checks:read` (CI check runs) and `deployments:read` (a PR's preview URL,
 * the ONLY place a VTEX FastStore WebOps deploy publishes it). That is what
 * lets a grant issued before a permission joined the allowlist pick it up on
 * its next refresh, riding the ~1h token cycle: no re-import, no re-install,
 * no user action.
 *
 * The rungs below it exist because GitHub 422s the WHOLE mint when ANY
 * requested permission exceeds what the installation granted — it does not
 * partially fulfil. So each rung drops one more optional (newest first) and the
 * last is exactly the grant's stored permissions. An installation that has
 * approved `checks` but not yet `deployments` therefore keeps `checks` instead
 * of losing both, and a grant that is still valid for its own scope is never
 * revoked because a widening failed.
 *
 * Cost: until an installation approves a newer permission, each refresh burns
 * one extra 422'd mint per un-approved optional (~1/hour per connection). That
 * is the deliberate price of picking the permission up automatically the moment
 * an org approves it, rather than requiring every connection to be re-imported.
 *
 * Exported pure so the ladder — the part with the ordering and dedup rules — is
 * unit-testable without mocking GitHub.
 */
export function buildUpgradeLadder(
  stored: Record<string, string>,
): Record<string, string>[] {
  const ladder: Record<string, string>[] = [];
  // A grant with NO stored permissions can't be widened safely: `permissions:
  // {}` reads as "omitted" to GitHub (minting every permission the installation
  // holds), and `capPermissions({})` returns the DEFAULT coding-agent set
  // (contents:write) — so both a literal and a capped empty map would hand the
  // grant more than it was ever issued. Refuse to build a ladder; the caller
  // then reports a transient failure and keeps the grant rather than escalating
  // it. Not reachable today (GitHub always echoes metadata back at issue time),
  // but this is KV data written by past versions of the code.
  if (Object.keys(stored).length === 0) return ladder;
  const push = (perms: Record<string, string>) => {
    if (!ladder.some((p) => samePermissions(p, perms))) ladder.push(perms);
  };
  for (let drop = 0; drop <= OPTIONAL_READ_UPGRADES.length; drop++) {
    const widened = { ...stored };
    for (const permission of OPTIONAL_READ_UPGRADES.slice(drop)) {
      widened[permission] = "read";
    }
    // A stored key the allowlist no longer permits makes capping throw. That
    // must not escape into the token endpoint as a 500 — it would bypass the
    // transient-vs-permanent mapping the whole refresh path is built around.
    // Skip the widened rung; the verbatim rung below still re-mints the grant.
    try {
      push(capPermissions(widened));
    } catch {
      // Not widenable — fall through to the stored set.
    }
  }
  // Last resort: exactly what the grant was issued with. Usually already
  // deduped away by the final loop rung; it differs only for a legacy grant
  // holding a permission `capPermissions` now caps (e.g. `checks:write`), and
  // there the stored set is the one we know the installation honoured.
  push({ ...stored });
  return ladder;
}

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

  const mintWith = (permissions: Record<string, string>) =>
    mintInstallationAccessToken(
      grant.installationId,
      { repository_ids: [grant.repositoryId], permissions },
      jwt,
    );

  const handleMintFailure = async (err: unknown): Promise<RefreshResult> => {
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
  };

  // Widen the grant into the optional reads the PR panel needs, shedding one at
  // a time when the installation hasn't approved it (see buildUpgradeLadder).
  let minted;
  let lastErr: unknown;
  for (const permissions of buildUpgradeLadder(grant.permissions)) {
    try {
      minted = await mintWith(permissions);
      break;
    } catch (err) {
      lastErr = err;
      // Only 422 ("permissions exceed what the App was granted", or the repo
      // left the installation) is worth retrying narrower. A 5xx/429 outage or
      // a 401/403 from our own App credentials says nothing about the requested
      // permission set, so burning the rest of the ladder on it would turn one
      // transient blip into N pointless GitHub calls per refresh.
      if (!(err instanceof GitHubAppApiError && err.status === 422)) break;
    }
  }
  // Every rung 422'd (or the first failed hard): the last error is the one that
  // decides transient-vs-permanent, and the last rung asked for exactly what
  // the grant was issued with — so a 422 there really is grant-invalidating.
  if (!minted) return handleMintFailure(lastErr);

  // --- slide TTL and respond ---
  const newExpiresAt = new Date(now + GRANT_TTL_SECONDS * 1000).toISOString();
  try {
    await opts.store.touch(grant.grantId, newExpiresAt);
  } catch {
    // Non-fatal: the access token is already minted.
  }

  const expiresIn = secondsUntil(minted.expires_at, now);

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
