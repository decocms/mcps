import { describe, expect, it } from "bun:test";
import { MIN_AUTH_TOKEN_LENGTH, readAuthToken, withAuth } from "./auth.ts";

const TOKEN = "a".repeat(64);
const env = { AUTH_TOKEN: TOKEN };

const ok: (req: Request) => Response = () => new Response("ok");
const request = (path: string, headers: Record<string, string> = {}) =>
  new Request(`https://mcp.example.com${path}`, { headers });

describe("readAuthToken", () => {
  it("returns the configured token", () => {
    expect(readAuthToken(env)).toBe(TOKEN);
  });

  it("throws when unset — an MCP with no secret must not boot", () => {
    expect(() => readAuthToken({})).toThrow(/AUTH_TOKEN is not set/);
  });

  it("throws on a blank token", () => {
    expect(() => readAuthToken({ AUTH_TOKEN: "   " })).toThrow(
      /AUTH_TOKEN is not set/,
    );
  });

  it("rejects placeholders shorter than the minimum", () => {
    const short = "x".repeat(MIN_AUTH_TOKEN_LENGTH - 1);
    expect(() => readAuthToken({ AUTH_TOKEN: short })).toThrow(/too short/);
  });
});

describe("withAuth", () => {
  it("throws at construction when the secret is missing", () => {
    expect(() => withAuth(ok, { env: {} })).toThrow(/AUTH_TOKEN is not set/);
  });

  it("rejects a request with no credential", async () => {
    const res = await withAuth(ok, { env })(request("/mcp"));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe('Bearer realm="mcp"');
  });

  it("rejects a wrong token", async () => {
    const res = await withAuth(ok, { env })(
      request("/mcp", { authorization: `Bearer ${"b".repeat(64)}` }),
    );
    expect(res.status).toBe(401);
  });

  it("accepts the token with a Bearer prefix", async () => {
    const res = await withAuth(ok, { env })(
      request("/mcp", { authorization: `Bearer ${TOKEN}` }),
    );
    expect(res.status).toBe(200);
  });

  it("accepts the raw token without a prefix", async () => {
    const res = await withAuth(ok, { env })(
      request("/mcp", { authorization: TOKEN }),
    );
    expect(res.status).toBe(200);
  });

  it("protects the direct tool-call endpoint too", async () => {
    const res = await withAuth(ok, { env })(request("/mcp/call-tool/DO_THING"));
    expect(res.status).toBe(401);
  });

  it("lets the kubernetes healthcheck through", async () => {
    const res = await withAuth(ok, { env })(request("/_healthcheck"));
    expect(res.status).toBe(200);
  });

  it("lets CORS preflight through", async () => {
    const res = await withAuth(ok, { env })(
      new Request("https://mcp.example.com/mcp", { method: "OPTIONS" }),
    );
    expect(res.status).toBe(200);
  });

  it("honors an explicit public path", async () => {
    const handler = withAuth(ok, { env, publicPaths: ["/oauth/callback"] });
    expect((await handler(request("/oauth/callback"))).status).toBe(200);
    expect((await handler(request("/oauth/other"))).status).toBe(401);
  });

  it("honors a public path prefix", async () => {
    const handler = withAuth(ok, { env, publicPaths: ["/webhooks/*"] });
    expect((await handler(request("/webhooks/gmail"))).status).toBe(200);
  });

  it("reads a custom header when Authorization carries an upstream key", async () => {
    const handler = withAuth(ok, { env, header: "x-deco-mcp-auth" });
    const res = await handler(
      request("/mcp", {
        authorization: "Bearer users-own-strapi-key",
        "x-deco-mcp-auth": TOKEN,
      }),
    );
    expect(res.status).toBe(200);
  });

  it("forwards the extra runtime arguments untouched", async () => {
    const seen: unknown[] = [];
    const handler = withAuth(
      (_req: Request, ...args: unknown[]) => {
        seen.push(...args);
        return new Response("ok");
      },
      { env },
    );
    await handler(request("/mcp", { authorization: TOKEN }), { KEY: 1 }, "ctx");
    expect(seen).toEqual([{ KEY: 1 }, "ctx"]);
  });
});
