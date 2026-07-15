import { afterEach, describe, expect, test } from "bun:test";
import {
  assertValidCredentials,
  buildGraphqlUrl,
  flattenConnection,
  normalizeStoreDomain,
  resolveCredentials,
  shopifyGraphql,
  toGid,
} from "./client.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.SHOPIFY_STORE_DOMAIN;
  delete process.env.SHOPIFY_ACCESS_TOKEN;
  delete process.env.SHOPIFY_API_VERSION;
});

describe("normalizeStoreDomain", () => {
  test("keeps a full myshopify domain", () => {
    expect(normalizeStoreDomain("my-store.myshopify.com")).toBe(
      "my-store.myshopify.com",
    );
  });

  test("strips protocol and path", () => {
    expect(normalizeStoreDomain("https://my-store.myshopify.com/admin")).toBe(
      "my-store.myshopify.com",
    );
  });

  test("expands a bare store name", () => {
    expect(normalizeStoreDomain("my-store")).toBe("my-store.myshopify.com");
  });

  test("keeps custom domains", () => {
    expect(normalizeStoreDomain("shop.example.com")).toBe("shop.example.com");
  });
});

describe("resolveCredentials", () => {
  test("reads token from authorization (strips Bearer) and domain from state", () => {
    const creds = resolveCredentials({
      authorization: "Bearer shpat_abc123",
      state: { storeDomain: "my-store" },
    });
    expect(creds.accessToken).toBe("shpat_abc123");
    expect(creds.storeDomain).toBe("my-store.myshopify.com");
    expect(creds.apiVersion).toBe("2026-07");
    expect(creds.sources).toEqual({
      storeDomain: "state",
      accessToken: "authorization",
    });
  });

  test("accepts a raw token without Bearer prefix", () => {
    const creds = resolveCredentials({
      authorization: "shpat_raw",
      state: { storeDomain: "my-store.myshopify.com" },
    });
    expect(creds.accessToken).toBe("shpat_raw");
  });

  test("falls back to env vars", () => {
    process.env.SHOPIFY_STORE_DOMAIN = "env-store.myshopify.com";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_env";
    const creds = resolveCredentials(undefined);
    expect(creds.storeDomain).toBe("env-store.myshopify.com");
    expect(creds.accessToken).toBe("shpat_env");
    expect(creds.sources).toEqual({
      storeDomain: "env",
      accessToken: "env",
    });
  });

  test("state overrides env for domain; authorization overrides env for token", () => {
    process.env.SHOPIFY_STORE_DOMAIN = "env-store.myshopify.com";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_env";
    const creds = resolveCredentials({
      authorization: "Bearer shpat_conn",
      state: { storeDomain: "state-store.myshopify.com" },
    });
    expect(creds.storeDomain).toBe("state-store.myshopify.com");
    expect(creds.accessToken).toBe("shpat_conn");
  });

  test("handles null authorization", () => {
    const creds = resolveCredentials({
      authorization: null,
      state: { storeDomain: "my-store" },
    });
    expect(creds.accessToken).toBe("");
    expect(creds.sources.accessToken).toBe("missing");
  });

  test("respects apiVersion from state", () => {
    const creds = resolveCredentials({
      authorization: "Bearer t",
      state: { storeDomain: "s", apiVersion: "2026-04" },
    });
    expect(creds.apiVersion).toBe("2026-04");
  });
});

describe("assertValidCredentials", () => {
  test("throws a descriptive error when the domain is missing", () => {
    const creds = resolveCredentials({ authorization: "Bearer t" });
    expect(() =>
      assertValidCredentials(creds, "SHOPIFY_GET_SHOP_INFO"),
    ).toThrow(/storeDomain is missing.*SHOPIFY_GET_SHOP_INFO/s);
  });

  test("throws a descriptive error when the token is missing", () => {
    const creds = resolveCredentials({ state: { storeDomain: "my-store" } });
    expect(() => assertValidCredentials(creds)).toThrow(
      /access token is missing/,
    );
  });
});

describe("buildGraphqlUrl", () => {
  test("builds the versioned admin endpoint", () => {
    expect(
      buildGraphqlUrl({
        storeDomain: "my-store.myshopify.com",
        accessToken: "t",
        apiVersion: "2026-07",
      }),
    ).toBe("https://my-store.myshopify.com/admin/api/2026-07/graphql.json");
  });
});

describe("toGid", () => {
  test("wraps numeric ids", () => {
    expect(toGid("Product", "123")).toBe("gid://shopify/Product/123");
  });

  test("passes through existing gids", () => {
    expect(toGid("Product", "gid://shopify/Product/123")).toBe(
      "gid://shopify/Product/123",
    );
  });
});

describe("flattenConnection", () => {
  test("flattens nodes", () => {
    const page = flattenConnection({
      nodes: [{ id: 1 }],
      pageInfo: { hasNextPage: true, endCursor: "abc" },
    });
    expect(page.items).toEqual([{ id: 1 }]);
    expect(page.pageInfo).toEqual({ hasNextPage: true, endCursor: "abc" });
  });

  test("flattens edges", () => {
    const page = flattenConnection({ edges: [{ node: { id: 2 } }] });
    expect(page.items).toEqual([{ id: 2 }]);
    expect(page.pageInfo).toEqual({ hasNextPage: false, endCursor: null });
  });

  test("tolerates null", () => {
    expect(flattenConnection(null).items).toEqual([]);
  });
});

const CREDS = {
  storeDomain: "my-store.myshopify.com",
  accessToken: "shpat_test",
  apiVersion: "2026-07",
};

function mockFetch(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>,
): { calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    return handler(url, init ?? {});
  }) as typeof fetch;
  return { calls };
}

describe("shopifyGraphql", () => {
  test("sends the access token header to the versioned endpoint", async () => {
    const { calls } = mockFetch(() =>
      Response.json({ data: { shop: { name: "Test" } } }),
    );
    const data = await shopifyGraphql<{ shop: { name: string } }>(
      CREDS,
      "{ shop { name } }",
    );
    expect(data.shop.name).toBe("Test");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      "https://my-store.myshopify.com/admin/api/2026-07/graphql.json",
    );
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["X-Shopify-Access-Token"]).toBe("shpat_test");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.query).toBe("{ shop { name } }");
  });

  test("throws with a scope hint on ACCESS_DENIED", async () => {
    mockFetch(() =>
      Response.json({
        errors: [
          {
            message: "Access denied for products",
            extensions: { code: "ACCESS_DENIED" },
          },
        ],
      }),
    );
    expect(shopifyGraphql(CREDS, "{ products { id } }")).rejects.toThrow(
      /Access denied.*missing a required read scope/s,
    );
  });

  test("retries THROTTLED errors and succeeds", async () => {
    let attempt = 0;
    const { calls } = mockFetch(() => {
      attempt++;
      if (attempt === 1) {
        return Response.json({
          errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
        });
      }
      return Response.json({ data: { ok: true } });
    });
    const data = await shopifyGraphql<{ ok: boolean }>(CREDS, "{ ok }");
    expect(data.ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  test("retries 5xx responses", async () => {
    let attempt = 0;
    const { calls } = mockFetch(() => {
      attempt++;
      if (attempt === 1) {
        return new Response("upstream error", { status: 502 });
      }
      return Response.json({ data: { ok: true } });
    });
    const data = await shopifyGraphql<{ ok: boolean }>(CREDS, "{ ok }");
    expect(data.ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  test("does not retry 401 and includes an auth hint", async () => {
    const { calls } = mockFetch(
      () => new Response("Invalid API key or access token", { status: 401 }),
    );
    expect(shopifyGraphql(CREDS, "{ shop { name } }")).rejects.toThrow(
      /401.*check that the Admin API access token/s,
    );
    await Bun.sleep(10);
    expect(calls).toHaveLength(1);
  });
});
