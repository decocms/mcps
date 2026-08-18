/**
 * Shopify OAuth (authorization code grant, offline access token).
 *
 * Shopify's authorize endpoint is per-store (`https://{shop}.myshopify.com/...`)
 * but the mesh runtime's `authorizationUrl(callbackUrl)` hook doesn't know which
 * store the user wants — so we can't build it up front. We borrow the WhatsApp
 * MCP's trick: point the runtime at our own `/oauth/custom` page, ask the
 * merchant for their shop, then drive the real Shopify grant ourselves and hand
 * the mesh a sealed credential.
 *
 * Flow:
 *   1. runtime → `authorizationUrl` → 302 to `/oauth/custom?callback_url=…`
 *   2. `/oauth/custom` renders a form; on submit it 302s to Shopify's
 *      `/admin/oauth/authorize` with `redirect_uri` pointing back at us and the
 *      mesh callback URL signed into `state`.
 *   3. Shopify → `/oauth/store/callback?code&shop&state&hmac`. We verify the
 *      HMAC + state, exchange the code for an *expiring* offline token, seal the
 *      `{shop, access, refresh, expiresIn}` grant into an encrypted blob, and
 *      302 back to the mesh callback with it as `code`.
 *   4. runtime → `exchangeCode({ code })` → we open the grant and hand the
 *      runtime a sealed access token (`{shop, token}`), a sealed refresh token
 *      (`{shop, refreshToken}`) and `expires_in`.
 *   5. When the access token expires, the client re-hits the runtime `/token`
 *      endpoint with `grant_type=refresh_token`; the runtime calls our
 *      `refreshToken`, which rotates the token against Shopify's per-store
 *      endpoint and hands back a freshly sealed access/refresh pair.
 *
 * Shopify no longer issues non-expiring offline tokens (the Admin API rejects
 * them with a 403), so the grant requests `expiring=1`: a ~1h access token plus
 * a ~90d rotating refresh token.
 */
import { OAuthInvalidGrantError } from "@decocms/runtime";
import { normalizeStoreDomain } from "./client.ts";
import {
  decryptCredential,
  encryptCredential,
  type SealedRefresh,
  signState,
  verifyShopifyHmac,
  verifyState,
} from "./token.ts";

export const OAUTH_CONNECT_PATH = "/oauth/custom";
// Kept free of the "shopify" token (Shopify forbids it in app URLs) and distinct
// from `/oauth/callback`, which the runtime mounts on this same origin.
export const OAUTH_CALLBACK_PATH = "/oauth/store/callback";

/**
 * Scopes requested during the grant. Almost all are read scopes; `write_themes`
 * backs the two theme-file write tools (SHOPIFY_UPDATE_THEME_FILES /
 * SHOPIFY_DELETE_THEME_FILES). Kept to what a standard store can grant — Shopify
 * rejects the whole authorize request (missing_shopify_permission) if the app
 * asks for a scope the store isn't entitled to.
 *
 * Deliberately excluded from the default because they're plan/entitlement-gated:
 *   - read_users, read_companies         → Shopify Plus only
 *   - read_shopify_payments_payouts/…    → require Shopify Payments
 * Add them (or trim further) per deployment via the SHOPIFY_SCOPES env var —
 * e.g. drop `write_themes` for a strictly read-only deployment.
 */
export const DEFAULT_SCOPES = [
  "read_products",
  "read_orders",
  "read_customers",
  "read_inventory",
  "read_fulfillments",
  "read_locations",
  "read_discounts",
  "read_content",
  "read_online_store_navigation",
  "read_themes",
  "write_themes",
  "read_locales",
  "read_translations",
  "read_marketing_events",
  "read_markets",
  "read_reports",
].join(",");

/** Requested scopes — SHOPIFY_SCOPES env (comma-separated) overrides the default. */
export function getScopes(): string {
  return process.env.SHOPIFY_SCOPES?.trim() || DEFAULT_SCOPES;
}

/** This MCP's own public origin. Deployed at a fixed domain, so we default to
 * it; override with SELF_URL for local dev (e.g. http://localhost:8001). */
const DEFAULT_SELF_URL = "https://mcp-commerce-store.deco.site";

interface OAuthEnv {
  clientId: string;
  clientSecret: string;
  tokenSecret: string;
  selfUrl: string;
}

/** Resolve OAuth config lazily (process.env isn't populated at module init on
 * some platforms). Throws a clear error if the core secrets are missing. */
function getOAuthEnv(): OAuthEnv {
  const clientId = process.env.SHOPIFY_CLIENT_ID || "";
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET || "";
  const tokenSecret = process.env.SHOPIFY_TOKEN_SECRET || "";
  if (!clientId || !clientSecret || !tokenSecret) {
    throw new Error(
      "Shopify OAuth is not configured — set SHOPIFY_CLIENT_ID, " +
        "SHOPIFY_CLIENT_SECRET and SHOPIFY_TOKEN_SECRET.",
    );
  }
  return {
    clientId,
    clientSecret,
    tokenSecret,
    selfUrl: process.env.SELF_URL || DEFAULT_SELF_URL,
  };
}

const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

function isValidShopDomain(shop: string): boolean {
  return SHOP_DOMAIN_RE.test(shop);
}

/** The deco mesh (which mints the OAuth callback URL) lives under decocms.com. */
const ALLOWED_CALLBACK_HOST_SUFFIXES = ["decocms.com"] as const;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Guard against open-redirect / code theft: only ever hand the OAuth code back
 * to a trusted origin. The runtime mounts its OAuth callback on this MCP's own
 * origin, so that's the primary allowed origin; we also accept decocms.com
 * (the mesh) and loopback over http for local dev (RFC 8252 §7.3). Same spirit
 * as the GitHub MCP's redirect allowlist.
 *
 * MESH_URL is an optional operator-controlled override: set it to allow a
 * self-hosted mesh origin (e.g. a local deco studio on a custom host).
 */
function isAllowedCallback(callbackUrl: string, selfUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(callbackUrl);
  } catch {
    return false;
  }

  // Primary case: the runtime's OAuth callback lives on our own origin.
  try {
    if (url.origin === new URL(selfUrl).origin) return true;
  } catch {
    // ignore a malformed selfUrl and fall through
  }

  // Explicit override for a self-hosted / local mesh (trusted, operator-set).
  const meshUrl = process.env.MESH_URL;
  if (meshUrl) {
    try {
      if (url.origin === new URL(meshUrl).origin) return true;
    } catch {
      // fall through to the default allowlist
    }
  }

  const host = url.hostname.toLowerCase();
  const isLoopback = LOOPBACK_HOSTS.has(host);
  if (url.protocol === "http:" && isLoopback) return true;
  if (url.protocol !== "https:") return false;
  return ALLOWED_CALLBACK_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

// ── Shopify token endpoint ────────────────────────────────────────────────────

/**
 * The offline grant sealed into the OAuth `code` handed back to the runtime.
 * Carries everything `exchangeCode` needs to mint the connection's tokens: the
 * runtime only forwards `code` (extra query params are dropped), so the access
 * token, refresh token and lifetime all have to ride inside it.
 */
interface SealedGrant {
  shop: string;
  access: string;
  refresh: string;
  expiresIn?: number;
}

/** Shopify's expiring-offline-token response (`/admin/oauth/access_token`). */
interface ShopifyTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  scope?: string;
}

/** POST to a store's `/admin/oauth/access_token` with form-encoded params. */
function postTokenEndpoint(
  shop: string,
  params: Record<string, string>,
): Promise<Response> {
  return fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(params).toString(),
  });
}

// ── Runtime oauth hook ────────────────────────────────────────────────────────

export const shopifyOAuth = {
  mode: "PKCE" as const,
  authorizationServer: "https://admin.shopify.com",
  authorizationUrl: (callbackUrl: string): string => {
    const env = getOAuthEnv();
    const url = new URL(OAUTH_CONNECT_PATH, env.selfUrl);
    url.searchParams.set("callback_url", callbackUrl);
    return url.toString();
  },
  exchangeCode: async ({ code }: { code: string }) => {
    const env = getOAuthEnv();
    const grant = decryptCredential<SealedGrant>(code, env.tokenSecret);
    if (!grant?.shop || !grant?.access || !grant?.refresh) {
      throw new Error("Invalid or tampered Shopify authorization code");
    }
    // Split the grant into the two credentials the runtime hands to the client:
    // the sealed access token (used verbatim as the Admin API token) and the
    // sealed refresh token (replayed to `refreshToken` when it expires).
    return {
      access_token: encryptCredential(
        { shop: grant.shop, token: grant.access },
        env.tokenSecret,
      ),
      token_type: "Bearer",
      refresh_token: encryptCredential(
        { shop: grant.shop, refreshToken: grant.refresh },
        env.tokenSecret,
      ),
      expires_in: grant.expiresIn,
    };
  },
  refreshToken: async (refreshToken: string) => {
    const env = getOAuthEnv();
    const sealed = decryptCredential<SealedRefresh>(
      refreshToken,
      env.tokenSecret,
    );
    if (!sealed?.shop || !sealed?.refreshToken) {
      // A garbage/tampered refresh token is unrecoverable — force a reconnect.
      throw new OAuthInvalidGrantError(
        "invalid_grant",
        "Invalid or tampered Shopify refresh token",
      );
    }

    const response = await postTokenEndpoint(sealed.shop, {
      client_id: env.clientId,
      client_secret: env.clientSecret,
      grant_type: "refresh_token",
      refresh_token: sealed.refreshToken,
    });

    // 4xx means the grant is gone (refresh token rotated out, app uninstalled,
    // 90-day refresh expiry) → invalid_grant so the client knows to reconnect.
    // 5xx/network are transient → plain Error surfaces as a 500 and the client
    // retries later without dropping the connection.
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      if (response.status >= 400 && response.status < 500) {
        throw new OAuthInvalidGrantError(
          "invalid_grant",
          `Shopify refused the refresh token (${response.status}): ${detail}`,
        );
      }
      throw new Error(
        `Shopify token refresh failed (${response.status}): ${detail}`,
      );
    }

    const body = (await response.json()) as ShopifyTokenResponse;
    if (!body.access_token || !body.refresh_token) {
      throw new Error("Shopify refresh did not return the expected tokens");
    }

    return {
      access_token: encryptCredential(
        { shop: sealed.shop, token: body.access_token },
        env.tokenSecret,
      ),
      token_type: "Bearer",
      refresh_token: encryptCredential(
        { shop: sealed.shop, refreshToken: body.refresh_token },
        env.tokenSecret,
      ),
      expires_in: body.expires_in,
    };
  },
};

// ── Custom route handlers ─────────────────────────────────────────────────────

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function connectForm(callbackUrl: string): Response {
  const safeCallback = callbackUrl.replace(/"/g, "&quot;");
  return htmlResponse(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Connect your Shopify store</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f6f6f7; margin: 0;
      display: flex; min-height: 100vh; align-items: center; justify-content: center; }
    .card { background: #fff; padding: 2rem; border-radius: 12px; max-width: 380px;
      width: 100%; box-shadow: 0 1px 4px rgba(0,0,0,.1); }
    h1 { font-size: 1.15rem; margin: 0 0 .25rem; }
    p { color: #616161; font-size: .875rem; margin: 0 0 1.25rem; }
    label { display: block; font-size: .8rem; font-weight: 600; margin-bottom: .35rem; }
    input { width: 100%; padding: .6rem .7rem; border: 1px solid #c9cccf;
      border-radius: 8px; font-size: .9rem; box-sizing: border-box; }
    button { margin-top: 1.25rem; width: 100%; padding: .65rem; border: 0;
      border-radius: 8px; background: #008060; color: #fff; font-size: .9rem;
      font-weight: 600; cursor: pointer; }
  </style>
</head>
<body>
  <form class="card" method="GET" action="${OAUTH_CONNECT_PATH}">
    <h1>Connect your Shopify store</h1>
    <p>Enter your store's <code>.myshopify.com</code> domain to authorize access.</p>
    <label for="shop">Store domain</label>
    <input id="shop" name="shop" placeholder="my-store.myshopify.com"
      autocomplete="off" autofocus required />
    <input type="hidden" name="callback_url" value="${safeCallback}" />
    <button type="submit">Continue to Shopify</button>
  </form>
</body>
</html>`);
}

/** GET /oauth/custom — render the form, or (once `shop` is provided) redirect
 * into Shopify's authorize endpoint. */
function handleConnect(url: URL, env: OAuthEnv): Response {
  const callbackUrl = url.searchParams.get("callback_url");
  if (!callbackUrl || !isAllowedCallback(callbackUrl, env.selfUrl)) {
    return htmlResponse("Invalid or missing callback URL.", 400);
  }

  const rawShop = url.searchParams.get("shop");
  if (!rawShop) return connectForm(callbackUrl);

  const shop = normalizeStoreDomain(rawShop);
  if (!isValidShopDomain(shop)) {
    return htmlResponse(
      "Enter a valid Shopify domain, e.g. my-store.myshopify.com.",
      400,
    );
  }

  const state = signState({ cb: callbackUrl }, env.tokenSecret);
  const authorize = new URL(`https://${shop}/admin/oauth/authorize`);
  authorize.searchParams.set("client_id", env.clientId);
  authorize.searchParams.set("scope", getScopes());
  authorize.searchParams.set(
    "redirect_uri",
    new URL(OAUTH_CALLBACK_PATH, env.selfUrl).toString(),
  );
  authorize.searchParams.set("state", state);
  // No `grant_options[]=per-user` → offline access token (the `expiring=1` opt-in
  // that makes it a rotating token is sent later, at the code-exchange step).
  return Response.redirect(authorize.toString(), 302);
}

/** GET /oauth/store/callback — validate Shopify's redirect, exchange the code
 * for an expiring offline token, seal the grant, and bounce back to the mesh
 * callback. */
async function handleCallback(url: URL, env: OAuthEnv): Promise<Response> {
  const params = url.searchParams;

  const state = verifyState<{ cb: string }>(
    params.get("state") ?? "",
    env.tokenSecret,
  );
  if (!state?.cb || !isAllowedCallback(state.cb, env.selfUrl)) {
    return htmlResponse("Invalid OAuth state.", 400);
  }

  if (!verifyShopifyHmac(params, env.clientSecret)) {
    return htmlResponse("Shopify HMAC validation failed.", 400);
  }

  const shop = normalizeStoreDomain(params.get("shop") ?? "");
  const code = params.get("code");
  if (!isValidShopDomain(shop) || !code) {
    return htmlResponse("Missing shop or authorization code.", 400);
  }

  // `expiring=1` opts into an expiring offline token (~1h access + ~90d rotating
  // refresh). Shopify rejects non-expiring tokens on the Admin API with a 403.
  const tokenResponse = await postTokenEndpoint(shop, {
    client_id: env.clientId,
    client_secret: env.clientSecret,
    code,
    expiring: "1",
  });

  if (!tokenResponse.ok) {
    const detail = (await tokenResponse.text()).slice(0, 300);
    return htmlResponse(
      `Shopify token exchange failed (${tokenResponse.status}): ${detail}`,
      502,
    );
  }

  const {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: expiresIn,
  } = (await tokenResponse.json()) as ShopifyTokenResponse;
  if (!accessToken || !refreshToken) {
    return htmlResponse(
      "Shopify did not return an expiring offline token (access + refresh).",
      502,
    );
  }

  // Seal the whole grant into the `code` — the runtime forwards only `code` to
  // `exchangeCode`, so the refresh token and lifetime have to travel inside it.
  const sealedGrant = encryptCredential(
    { shop, access: accessToken, refresh: refreshToken, expiresIn },
    env.tokenSecret,
  );
  const dest = new URL(state.cb);
  dest.searchParams.set("code", sealedGrant);
  return Response.redirect(dest.toString(), 302);
}

/** Dispatch the two custom OAuth routes; returns null for everything else so
 * the caller falls through to the runtime. */
export async function handleOAuthRoute(req: Request): Promise<Response | null> {
  if (req.method !== "GET") return null;
  const url = new URL(req.url);
  if (
    url.pathname !== OAUTH_CONNECT_PATH &&
    url.pathname !== OAUTH_CALLBACK_PATH
  ) {
    return null;
  }

  let env: OAuthEnv;
  try {
    env = getOAuthEnv();
  } catch (error) {
    return htmlResponse(
      error instanceof Error ? error.message : "OAuth is not configured.",
      500,
    );
  }

  return url.pathname === OAUTH_CONNECT_PATH
    ? handleConnect(url, env)
    : handleCallback(url, env);
}
