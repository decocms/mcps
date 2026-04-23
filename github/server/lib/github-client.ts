/**
 * GitHub OAuth helpers
 */

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
export function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri?: string,
): Promise<GitHubTokenResponse> {
  const body: Record<string, string> = {
    client_id: clientId,
    client_secret: clientSecret,
    code,
  };

  if (redirectUri) {
    body.redirect_uri = redirectUri;
  }

  return postToGitHub(body);
}

/**
 * Exchange a refresh token for a new access token.
 * Only works for GitHub Apps that issue expiring user tokens.
 */
export function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<GitHubTokenResponse> {
  return postToGitHub({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}
