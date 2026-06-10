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
  generateGrantCredentials,
  type RepoGrantMetadata,
  type RepoGrantStore,
} from "./repo-grant-store.ts";
import { mintRepoScopedToken } from "./repo-token.ts";

void DEFAULT_PUBLIC_BASE_URL; // used by HTTP adapters in Task 8

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
