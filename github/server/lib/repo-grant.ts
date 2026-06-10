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
    tokenEndpoint: `${opts.baseUrl}${REPO_GRANT_TOKEN_PATH}`,
    clientId: opts.clientId,
    refreshTokenExpiresAt: expiresAt,
  };
}
