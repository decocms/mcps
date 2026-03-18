/**
 * GitHub OAuth helpers
 */

/**
 * Exchange an OAuth code for an access token
 *
 * This is used during the GitHub App OAuth flow to exchange
 * the authorization code for an installation access token.
 */
export async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri?: string,
): Promise<{ access_token: string; token_type: string }> {
  const body: Record<string, string> = {
    client_id: clientId,
    client_secret: clientSecret,
    code,
  };

  if (redirectUri) {
    body.redirect_uri = redirectUri;
  }

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub OAuth failed: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    token_type: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (data.error) {
    throw new Error(
      `GitHub OAuth error: ${data.error_description || data.error}`,
    );
  }

  return {
    access_token: data.access_token,
    token_type: data.token_type || "Bearer",
  };
}
