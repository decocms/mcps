/**
 * GitHub OAuth helpers
 */

import { OAuthInvalidGrantError } from "@decocms/runtime";

export interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
}

interface RawGitHubTokenResponse extends GitHubTokenResponse {
  error?: string;
  error_description?: string;
}

const GITHUB_TOKEN_ENDPOINT = "https://github.com/login/oauth/access_token";

function githubAppBasicAuthHeader(
  clientId: string,
  clientSecret: string,
): string {
  const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  return `Basic ${encoded}`;
}

async function postToGitHub(
  body: Record<string, string>,
): Promise<GitHubTokenResponse> {
  const response = await fetch(GITHUB_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "deco-cms-github-mcp",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub OAuth failed: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as RawGitHubTokenResponse;

  if (data.error) {
    throw new Error(
      `GitHub OAuth error: ${data.error_description || data.error}`,
    );
  }

  return {
    access_token: data.access_token,
    token_type: data.token_type || "Bearer",
    expires_in: data.expires_in,
    refresh_token: data.refresh_token,
    refresh_token_expires_in: data.refresh_token_expires_in,
    scope: data.scope,
  };
}

/**
 * Exchange an OAuth code for an access token.
 *
 * GitHub Apps with "Expire user authorization tokens" enabled return
 * `refresh_token`, `expires_in`, and `refresh_token_expires_in` alongside
 * the `access_token`; all fields are forwarded unchanged.
 */
export interface GitHubOAuthOptions {
  redirectUri?: string;
  /** GitHub App user token: limit access to a single repository. */
  repositoryId?: number;
}

export function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
  options?: GitHubOAuthOptions,
): Promise<GitHubTokenResponse> {
  const body: Record<string, string> = {
    client_id: clientId,
    client_secret: clientSecret,
    code,
  };

  if (options?.redirectUri) {
    body.redirect_uri = options.redirectUri;
  }

  if (options?.repositoryId !== undefined) {
    body.repository_id = String(options.repositoryId);
  }

  return postToGitHub(body);
}

/**
 * Exchange a refresh token for a new access token.
 * Only works for GitHub Apps that issue expiring user tokens.
 *
 * Throws `OAuthInvalidGrantError` for the spec-compliant permanent-failure
 * cases (`invalid_grant` / `bad_refresh_token`) so the runtime's `/token`
 * handler can map it to `400 invalid_grant` and let mesh evict the cached
 * refresh_token. Anything else (5xx, network, malformed body) propagates
 * as a plain `Error` and surfaces as `500` — treated as transient by mesh.
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  options?: Pick<GitHubOAuthOptions, "repositoryId">,
): Promise<GitHubTokenResponse> {
  const payload: Record<string, string> = {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  };

  if (options?.repositoryId !== undefined) {
    payload.repository_id = String(options.repositoryId);
  }

  const response = await fetch(GITHUB_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "deco-cms-github-mcp",
    },
    body: JSON.stringify(payload),
  });

  // Per RFC 6749 §5.2 the canonical signal is the body's `error` field, not
  // the HTTP status — and GitHub historically returns `200 { error: "..." }`
  // when `Accept: application/json` is set. Read the body before branching
  // on status so we can recognise the typed error in either shape.
  const data = (await response.json().catch(() => ({}))) as
    | RawGitHubTokenResponse
    | Record<string, never>;

  if (data.error === "invalid_grant" || data.error === "bad_refresh_token") {
    throw new OAuthInvalidGrantError(data.error, data.error_description);
  }

  if (!response.ok) {
    throw new Error(
      `GitHub OAuth failed: ${response.status} - ${data.error ?? "unknown"}`,
    );
  }

  if (data.error) {
    throw new Error(
      `GitHub OAuth error: ${data.error_description || data.error}`,
    );
  }

  return {
    access_token: data.access_token,
    token_type: data.token_type || "Bearer",
    expires_in: data.expires_in,
    refresh_token: data.refresh_token,
    refresh_token_expires_in: data.refresh_token_expires_in,
    scope: data.scope,
  };
}

export interface ScopedUserTokenResponse {
  token: string;
  expires_in?: number;
}

/**
 * Mint a repository-scoped user access token from an existing user token.
 * @see https://docs.github.com/en/rest/apps/apps#create-a-scoped-access-token
 */
export async function scopeUserAccessTokenToRepository(
  accessToken: string,
  clientId: string,
  clientSecret: string,
  options: {
    repositoryId: number;
    /** GitHub user or organization login that owns the repository. */
    target: string;
  },
): Promise<ScopedUserTokenResponse> {
  const response = await fetch(
    `https://api.github.com/applications/${clientId}/token/scoped`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: githubAppBasicAuthHeader(clientId, clientSecret),
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "deco-cms-github-mcp",
      },
      body: JSON.stringify({
        access_token: accessToken,
        target: options.target,
        repository_ids: [options.repositoryId],
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `GitHub scoped token failed: ${response.status} - ${errorText}`,
    );
  }

  const data = (await response.json()) as {
    token: string;
    expires_in?: number;
  };

  if (!data.token) {
    throw new Error("GitHub scoped token response missing token");
  }

  return { token: data.token, expires_in: data.expires_in };
}
