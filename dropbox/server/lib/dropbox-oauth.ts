/**
 * Dropbox OAuth helpers
 *
 * Token endpoint: https://api.dropboxapi.com/oauth2/token
 *
 * `invalid_grant` (revoked / expired refresh token) is mapped to
 * OAuthInvalidGrantError so the runtime's /token handler emits a spec
 * compliant 400 invalid_grant — letting the mesh evict the cached
 * refresh_token. Anything else propagates as a plain Error and surfaces as
 * 500 (treated as transient).
 */

import { OAuthInvalidGrantError } from "@decocms/runtime";

/** Least-privilege scopes for the tools this MCP exposes. */
export const REQUESTED_SCOPES = [
  "account_info.read",
  "files.metadata.read",
  "files.metadata.write",
  "files.content.read",
  "files.content.write",
  "sharing.read",
  "sharing.write",
];

const DROPBOX_TOKEN_ENDPOINT = "https://api.dropboxapi.com/oauth2/token";

export interface DropboxTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  uid?: string;
  account_id?: string;
}

interface RawTokenResponse extends DropboxTokenResponse {
  error?: string;
  error_description?: string;
}

async function postToken(body: URLSearchParams): Promise<DropboxTokenResponse> {
  const response = await fetch(DROPBOX_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  // Per RFC 6749 §5.2 the canonical signal is the body's `error` field, not
  // the HTTP status. Read body before branching on status so we recognise
  // typed errors in either shape.
  const data = (await response.json().catch(() => ({}))) as
    | RawTokenResponse
    | Record<string, never>;

  if (
    data.error === "invalid_grant" ||
    data.error === "invalid_refresh_token"
  ) {
    throw new OAuthInvalidGrantError(data.error, data.error_description);
  }

  if (!response.ok) {
    throw new Error(
      `Dropbox OAuth failed: ${response.status} - ${data.error ?? "unknown"}${
        data.error_description ? ` (${data.error_description})` : ""
      }`,
    );
  }

  if (data.error) {
    throw new Error(
      `Dropbox OAuth error: ${data.error_description || data.error}`,
    );
  }

  return {
    access_token: data.access_token,
    token_type: data.token_type || "Bearer",
    expires_in: data.expires_in,
    refresh_token: data.refresh_token,
    scope: data.scope,
    uid: data.uid,
    account_id: data.account_id,
  };
}

export function exchangeCodeForToken(args: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
  codeVerifier?: string;
}): Promise<DropboxTokenResponse> {
  const body = new URLSearchParams({
    code: args.code,
    grant_type: "authorization_code",
    client_id: args.clientId,
    client_secret: args.clientSecret,
  });

  if (args.redirectUri) {
    body.set("redirect_uri", args.redirectUri);
  }
  if (args.codeVerifier) {
    body.set("code_verifier", args.codeVerifier);
  }

  return postToken(body);
}

export function refreshAccessToken(args: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<DropboxTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: args.refreshToken,
    client_id: args.clientId,
    client_secret: args.clientSecret,
  });

  return postToken(body);
}
