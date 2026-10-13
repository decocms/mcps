/**
 * Figma OAuth 2.0 (https://developers.figma.com/docs/rest-api/oauth-apps/).
 *
 * - authorize: https://www.figma.com/oauth
 * - token:     POST https://api.figma.com/v1/oauth/token   (HTTP Basic client auth)
 * - refresh:   POST https://api.figma.com/v1/oauth/refresh (HTTP Basic client auth)
 *
 * Access tokens last 90 days. Figma keeps one access token per app per user:
 * refreshing invalidates the previous one, so one Figma account connected in
 * two places will log the other out on the next refresh.
 *
 * PKCE between Mesh and this server is handled by the runtime; the upstream
 * leg to Figma is a confidential-client exchange with the client secret.
 */

import { OAuthInvalidGrantError } from "@decocms/runtime";

/** Least privilege for the read-only toolset plus Code Connect via dev resources. */
export const FIGMA_SCOPES = [
  "current_user:read",
  "file_content:read",
  "file_metadata:read",
  "file_comments:read",
  "file_dev_resources:read",
  "file_dev_resources:write",
  "library_content:read",
  "library_assets:read",
  "team_library_content:read",
];

interface TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  user_id_string?: string;
}

function credentials() {
  const clientId = process.env.FIGMA_CLIENT_ID || "";
  const clientSecret = process.env.FIGMA_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) {
    throw new Error(
      "Figma OAuth is not configured: set FIGMA_CLIENT_ID and FIGMA_CLIENT_SECRET.",
    );
  }
  return { clientId, clientSecret };
}

export function authorizationUrl(callbackUrl: string): string {
  const callback = new URL(callbackUrl);
  const state = callback.searchParams.get("state");
  // Keep redirect_uri clean (it must match the registered callback exactly)
  // and pass state as its own parameter.
  callback.searchParams.delete("state");

  const url = new URL("https://www.figma.com/oauth");
  url.searchParams.set("client_id", credentials().clientId);
  url.searchParams.set("redirect_uri", callback.toString());
  url.searchParams.set("scope", FIGMA_SCOPES.join(" "));
  url.searchParams.set("response_type", "code");
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

async function postToken(
  path: string,
  body: Record<string, string>,
): Promise<TokenResponse> {
  const { clientId, clientSecret } = credentials();
  const res = await fetch(`https://api.figma.com${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams(body),
  });

  const data = (await res.json().catch(() => ({}))) as TokenResponse & {
    error?: string | boolean;
    message?: string;
    error_description?: string;
  };

  if (!res.ok || data.error) {
    const reason =
      typeof data.error === "string"
        ? data.error
        : (data.message ?? `HTTP ${res.status}`);
    // A revoked or expired refresh token must surface as invalid_grant so Mesh
    // drops it instead of retrying forever. Figma answers 400 for these; a 401
    // means bad client credentials, which must not evict users' tokens.
    if (
      path.endsWith("/refresh") &&
      (res.status === 400 || reason === "invalid_grant")
    ) {
      throw new OAuthInvalidGrantError(
        "invalid_grant",
        data.error_description ?? data.message ?? reason,
      );
    }
    throw new Error(`Figma OAuth failed: ${reason}`);
  }
  return data;
}

export async function exchangeCode({
  code,
  redirect_uri,
}: {
  code: string;
  redirect_uri?: string;
}) {
  if (!redirect_uri)
    throw new Error("redirect_uri is required for the Figma token exchange");
  const data = await postToken("/v1/oauth/token", {
    code,
    redirect_uri,
    grant_type: "authorization_code",
  });
  return {
    access_token: data.access_token,
    token_type: "Bearer",
    expires_in: data.expires_in,
    refresh_token: data.refresh_token,
    scope: FIGMA_SCOPES.join(" "),
  };
}

export async function refreshToken(refresh: string) {
  const data = await postToken("/v1/oauth/refresh", { refresh_token: refresh });
  return {
    access_token: data.access_token,
    token_type: "Bearer",
    expires_in: data.expires_in,
    // Figma does not rotate refresh tokens; echo the original back.
    refresh_token: data.refresh_token ?? refresh,
    scope: FIGMA_SCOPES.join(" "),
  };
}
