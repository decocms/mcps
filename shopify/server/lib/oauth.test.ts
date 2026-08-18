import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  handleOAuthRoute,
  OAUTH_CALLBACK_PATH,
  OAUTH_CONNECT_PATH,
  shopifyOAuth,
} from "./oauth.ts";
import {
  decryptCredential,
  encryptCredential,
  signState,
  verifyState,
} from "./token.ts";
import { createHmac } from "node:crypto";

const SELF = "https://mcp-commerce-store.deco.site";
const MESH = "https://api.decocms.com";
const SECRET = "oauth-test-secret";
const CLIENT_ID = "test-client-id";
const CLIENT_SECRET = "test-client-secret";
const CALLBACK = `${MESH}/oauth/callback?state=mesh-state`;

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.SHOPIFY_CLIENT_ID = CLIENT_ID;
  process.env.SHOPIFY_CLIENT_SECRET = CLIENT_SECRET;
  process.env.SHOPIFY_TOKEN_SECRET = SECRET;
  process.env.SELF_URL = SELF;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.SHOPIFY_CLIENT_ID;
  delete process.env.SHOPIFY_CLIENT_SECRET;
  delete process.env.SHOPIFY_TOKEN_SECRET;
  delete process.env.SELF_URL;
  delete process.env.SHOPIFY_SCOPES;
  delete process.env.MESH_URL;
});

function shopifyHmac(params: Record<string, string>): string {
  const message = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("&");
  return createHmac("sha256", CLIENT_SECRET).update(message).digest("hex");
}

describe("authorizationUrl", () => {
  test("points at our own connect page carrying the callback", () => {
    const url = new URL(shopifyOAuth.authorizationUrl(CALLBACK));
    expect(url.origin).toBe(SELF);
    expect(url.pathname).toBe(OAUTH_CONNECT_PATH);
    expect(url.searchParams.get("callback_url")).toBe(CALLBACK);
  });

  test("defaults to the prod domain (not localhost) when SELF_URL is unset", () => {
    delete process.env.SELF_URL;
    const url = new URL(shopifyOAuth.authorizationUrl(CALLBACK));
    expect(url.origin).toBe("https://mcp-commerce-store.deco.site");
  });
});

describe("GET /oauth/custom", () => {
  test("renders the store-domain form when no shop is given", async () => {
    const res = await handleOAuthRoute(
      new Request(
        `${SELF}${OAUTH_CONNECT_PATH}?callback_url=${encodeURIComponent(CALLBACK)}`,
      ),
    );
    expect(res?.status).toBe(200);
    expect(res?.headers.get("Content-Type")).toContain("text/html");
    expect(await res!.text()).toContain("Connect your Shopify store");
  });

  test("accepts a callback on the MCP's own origin (runtime mounts it there)", async () => {
    const selfCallback = `${SELF}/oauth/callback?state=abc`;
    const res = await handleOAuthRoute(
      new Request(
        `${SELF}${OAUTH_CONNECT_PATH}?callback_url=${encodeURIComponent(selfCallback)}`,
      ),
    );
    expect(res?.status).toBe(200);
  });

  test("rejects an off-origin callback URL", async () => {
    const res = await handleOAuthRoute(
      new Request(
        `${SELF}${OAUTH_CONNECT_PATH}?callback_url=${encodeURIComponent("https://evil.example.com/x")}`,
      ),
    );
    expect(res?.status).toBe(400);
  });

  test("MESH_URL allows a self-hosted mesh origin (e.g. local studio)", async () => {
    const studio = "https://studio.internal/oauth/callback?state=s";
    // Without the override this custom origin is rejected...
    const rejected = await handleOAuthRoute(
      new Request(
        `${SELF}${OAUTH_CONNECT_PATH}?callback_url=${encodeURIComponent(studio)}`,
      ),
    );
    expect(rejected?.status).toBe(400);
    // ...but setting MESH_URL to that origin allows it.
    process.env.MESH_URL = "https://studio.internal";
    const allowed = await handleOAuthRoute(
      new Request(
        `${SELF}${OAUTH_CONNECT_PATH}?callback_url=${encodeURIComponent(studio)}`,
      ),
    );
    expect(allowed?.status).toBe(200);
  });

  test("redirects to Shopify authorize once a shop is provided", async () => {
    const res = await handleOAuthRoute(
      new Request(
        `${SELF}${OAUTH_CONNECT_PATH}?shop=my-store.myshopify.com&callback_url=${encodeURIComponent(CALLBACK)}`,
      ),
    );
    expect(res?.status).toBe(302);
    const location = new URL(res!.headers.get("Location")!);
    expect(location.origin).toBe("https://my-store.myshopify.com");
    expect(location.pathname).toBe("/admin/oauth/authorize");
    expect(location.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(location.searchParams.get("redirect_uri")).toBe(
      `${SELF}${OAUTH_CALLBACK_PATH}`,
    );
    expect(location.searchParams.get("scope")).toContain("read_products");
    // offline grant → no per-user grant option
    expect(location.searchParams.get("grant_options[]")).toBeNull();
    // state carries the mesh callback, tamper-proof
    expect(
      verifyState<{ cb: string }>(location.searchParams.get("state")!, SECRET),
    ).toEqual({ cb: CALLBACK });
  });

  test("rejects a non-myshopify shop", async () => {
    const res = await handleOAuthRoute(
      new Request(
        `${SELF}${OAUTH_CONNECT_PATH}?shop=evil.example.com&callback_url=${encodeURIComponent(CALLBACK)}`,
      ),
    );
    expect(res?.status).toBe(400);
  });

  async function requestedScopes(): Promise<string> {
    const res = await handleOAuthRoute(
      new Request(
        `${SELF}${OAUTH_CONNECT_PATH}?shop=my-store.myshopify.com&callback_url=${encodeURIComponent(CALLBACK)}`,
      ),
    );
    return new URL(res!.headers.get("Location")!).searchParams.get("scope")!;
  }

  test("default scopes omit Plus/Payments-gated ones", async () => {
    const scope = await requestedScopes();
    expect(scope).toContain("read_products");
    expect(scope).not.toContain("read_users");
    expect(scope).not.toContain("read_companies");
    expect(scope).not.toContain("read_shopify_payments");
  });

  test("SHOPIFY_SCOPES env overrides the default", async () => {
    process.env.SHOPIFY_SCOPES = "read_products,read_orders";
    expect(await requestedScopes()).toBe("read_products,read_orders");
  });
});

describe("GET /oauth/store/callback", () => {
  function callbackUrl(overrides: Record<string, string> = {}): string {
    const state = signState({ cb: CALLBACK }, SECRET);
    const base: Record<string, string> = {
      code: "shopify-auth-code",
      shop: "my-store.myshopify.com",
      state,
      ...overrides,
    };
    if (!("hmac" in overrides)) base.hmac = shopifyHmac(base);
    const params = new URLSearchParams(base);
    return `${SELF}${OAUTH_CALLBACK_PATH}?${params.toString()}`;
  }

  test("exchanges the code for an expiring token and seals the grant", async () => {
    let exchangeBody: Record<string, string> | undefined;
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe(
        "https://my-store.myshopify.com/admin/oauth/access_token",
      );
      expect(init?.headers).toMatchObject({
        "Content-Type": "application/x-www-form-urlencoded",
      });
      exchangeBody = Object.fromEntries(
        new URLSearchParams(String(init?.body)),
      );
      return Response.json({
        access_token: "shpat_access",
        refresh_token: "shprt_refresh",
        expires_in: 3600,
        refresh_token_expires_in: 7776000,
      });
    }) as typeof fetch;

    const res = await handleOAuthRoute(new Request(callbackUrl()));
    expect(res?.status).toBe(302);
    // `expiring=1` is what makes Shopify issue a rotating offline token.
    expect(exchangeBody).toEqual({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: "shopify-auth-code",
      expiring: "1",
    });

    const dest = new URL(res!.headers.get("Location")!);
    expect(dest.origin).toBe(MESH);
    expect(dest.searchParams.get("state")).toBe("mesh-state");
    // The `code` carries the whole grant (access + refresh + lifetime).
    const grant = dest.searchParams.get("code")!;
    expect(
      decryptCredential<{
        shop: string;
        access: string;
        refresh: string;
        expiresIn: number;
      }>(grant, SECRET),
    ).toEqual({
      shop: "my-store.myshopify.com",
      access: "shpat_access",
      refresh: "shprt_refresh",
      expiresIn: 3600,
    });
  });

  test("fails when Shopify omits the refresh token", async () => {
    globalThis.fetch = (async () =>
      Response.json({
        access_token: "shpat_access",
      })) as unknown as typeof fetch;
    const res = await handleOAuthRoute(new Request(callbackUrl()));
    expect(res?.status).toBe(502);
  });

  test("rejects a bad Shopify HMAC", async () => {
    const res = await handleOAuthRoute(
      new Request(callbackUrl({ hmac: "deadbeef" })),
    );
    expect(res?.status).toBe(400);
  });

  test("rejects a tampered state", async () => {
    const res = await handleOAuthRoute(
      new Request(callbackUrl({ state: "forged" })),
    );
    expect(res?.status).toBe(400);
  });
});

describe("exchangeCode", () => {
  test("splits the sealed grant into access + refresh tokens", async () => {
    // A sealed grant minted by the callback is passed back as `code`.
    const grant = encryptCredential(
      {
        shop: "s.myshopify.com",
        access: "shpat_x",
        refresh: "shprt_y",
        expiresIn: 3600,
      },
      SECRET,
    );
    const result = await shopifyOAuth.exchangeCode({ code: grant });
    expect(result.token_type).toBe("Bearer");
    expect(result.expires_in).toBe(3600);
    expect(
      decryptCredential<{ shop: string; token: string }>(
        result.access_token,
        SECRET,
      ),
    ).toEqual({ shop: "s.myshopify.com", token: "shpat_x" });
    expect(
      decryptCredential<{ shop: string; refreshToken: string }>(
        result.refresh_token!,
        SECRET,
      ),
    ).toEqual({ shop: "s.myshopify.com", refreshToken: "shprt_y" });
  });

  test("throws on a tampered code", async () => {
    await expect(
      shopifyOAuth.exchangeCode({ code: "not-a-real-credential" }),
    ).rejects.toThrow(/Invalid or tampered/);
  });
});

describe("refreshToken", () => {
  function sealedRefresh(shop = "my-store.myshopify.com", token = "shprt_old") {
    return encryptCredential({ shop, refreshToken: token }, SECRET);
  }

  test("rotates the token against the store's endpoint", async () => {
    let body: Record<string, string> | undefined;
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe(
        "https://my-store.myshopify.com/admin/oauth/access_token",
      );
      body = Object.fromEntries(new URLSearchParams(String(init?.body)));
      return Response.json({
        access_token: "shpat_new",
        refresh_token: "shprt_new",
        expires_in: 3600,
      });
    }) as typeof fetch;

    const result = await shopifyOAuth.refreshToken(sealedRefresh());
    expect(body).toEqual({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: "shprt_old",
    });
    expect(result.expires_in).toBe(3600);
    expect(
      decryptCredential<{ shop: string; token: string }>(
        result.access_token,
        SECRET,
      ),
    ).toEqual({ shop: "my-store.myshopify.com", token: "shpat_new" });
    expect(
      decryptCredential<{ shop: string; refreshToken: string }>(
        result.refresh_token!,
        SECRET,
      ),
    ).toEqual({ shop: "my-store.myshopify.com", refreshToken: "shprt_new" });
  });

  test("maps a tampered refresh token to invalid_grant", async () => {
    await expect(
      shopifyOAuth.refreshToken("not-a-real-token"),
    ).rejects.toMatchObject({ error: "invalid_grant" });
  });

  test("maps a Shopify 4xx to invalid_grant (client must reconnect)", async () => {
    globalThis.fetch = (async () =>
      new Response("invalid_grant", {
        status: 400,
      })) as unknown as typeof fetch;
    await expect(
      shopifyOAuth.refreshToken(sealedRefresh()),
    ).rejects.toMatchObject({ error: "invalid_grant" });
  });

  test("treats a Shopify 5xx as transient (plain error → 500)", async () => {
    globalThis.fetch = (async () =>
      new Response("boom", { status: 503 })) as unknown as typeof fetch;
    const err = await shopifyOAuth
      .refreshToken(sealedRefresh())
      .catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.error).toBeUndefined();
  });
});

describe("handleOAuthRoute passthrough", () => {
  test("returns null for unrelated paths", async () => {
    expect(await handleOAuthRoute(new Request(`${SELF}/mcp`))).toBeNull();
  });

  test("returns null for non-GET requests", async () => {
    expect(
      await handleOAuthRoute(
        new Request(`${SELF}${OAUTH_CONNECT_PATH}`, { method: "POST" }),
      ),
    ).toBeNull();
  });
});
