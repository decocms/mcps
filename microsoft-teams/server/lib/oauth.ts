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
  "ChannelMessage.ReadWrite", // edit/delete/react on channel messages
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

export async function exchangeAuthCode(
  tenantId: string,
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
  codeVerifier?: string,
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
  if (codeVerifier) body.set("code_verifier", codeVerifier);
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
