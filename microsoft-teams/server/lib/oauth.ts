/**
 * Microsoft OAuth 2.0 — Authorization Code flow helpers.
 *
 * https://learn.microsoft.com/azure/active-directory/develop/v2-oauth2-auth-code-flow
 */

export const SCOPES = [
  "offline_access",
  "User.Read",
  // Channel scopes
  "ChannelMessage.Send",
  "ChannelMessage.Read.All",
  "Channel.ReadBasic.All",
  "Team.ReadBasic.All",
  // Chat scopes (1-on-1 and group)
  "Chat.ReadWrite",
  "ChatMessage.Send",
  "User.ReadBasic.All",
];

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export function buildAuthorizeUrl(
  tenantId: string,
  clientId: string,
  redirectUri: string,
  state: string,
): string {
  const url = new URL(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
  );
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export async function exchangeAuthCode(
  tenantId: string,
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    scope: SCOPES.join(" "),
  });
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    throw new Error(
      `Auth code exchange failed (${response.status}): ${await response.text()}`,
    );
  }
  return response.json() as Promise<TokenResponse>;
}

export async function exchangeRefreshToken(
  tenantId: string,
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<TokenResponse> {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: SCOPES.join(" "),
  });
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    throw new Error(
      `Refresh token exchange failed (${response.status}): ${await response.text()}`,
    );
  }
  return response.json() as Promise<TokenResponse>;
}

export async function getUserProfile(accessToken: string): Promise<{
  id: string;
  displayName: string;
  userPrincipalName: string;
  mail?: string;
} | null> {
  try {
    const response = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    return (await response.json()) as {
      id: string;
      displayName: string;
      userPrincipalName: string;
      mail?: string;
    };
  } catch {
    return null;
  }
}
