import { afterEach, describe, expect, test } from "bun:test";
import {
  _clearSessionCache,
  buildAppTokenLoginUrl,
  getVtexIdSessionToken,
  jwtExpirySeconds,
  vtexIdCookieHeader,
  VTEXID_COOKIE_NAME,
} from "./vtexid-session.ts";

afterEach(() => _clearSessionCache());

describe("buildAppTokenLoginUrl", () => {
  test("targets the vtexid apptoken login with an= account", () => {
    expect(buildAppTokenLoginUrl("lojausereserva")).toBe(
      "https://lojausereserva.vtexcommercestable.com.br/api/vtexid/apptoken/login?an=lojausereserva",
    );
  });
});

describe("vtexIdCookieHeader", () => {
  test("builds the VtexIdclientAutCookie cookie pair", () => {
    expect(vtexIdCookieHeader("abc.def.ghi")).toBe(
      `${VTEXID_COOKIE_NAME}=abc.def.ghi`,
    );
  });
});

describe("jwtExpirySeconds", () => {
  test("extracts exp from a JWT payload", () => {
    const header = btoa(JSON.stringify({ alg: "none" }));
    const payload = btoa(JSON.stringify({ sub: "x", exp: 1782316381 }));
    expect(jwtExpirySeconds(`${header}.${payload}.sig`)).toBe(1782316381);
  });

  test("returns null for a non-JWT or missing exp", () => {
    expect(jwtExpirySeconds("not-a-jwt")).toBeNull();
    const payload = btoa(JSON.stringify({ sub: "x" }));
    expect(jwtExpirySeconds(`h.${payload}.s`)).toBeNull();
  });
});

describe("getVtexIdSessionToken caching", () => {
  const creds = { accountName: "acme", appKey: "k", appToken: "t" };

  test("reuses a cached token until shortly before it expires", async () => {
    let logins = 0;
    const realFetch = globalThis.fetch;
    // exp is 1000s past `now`, well outside the 60s safety margin.
    const payload = btoa(JSON.stringify({ exp: 1000 }));
    const token = `h.${payload}.s`;
    globalThis.fetch = (async () => {
      logins++;
      return new Response(JSON.stringify({ token }), { status: 200 });
    }) as unknown as typeof fetch;

    try {
      const a = await getVtexIdSessionToken(creds, { now: 0 });
      const b = await getVtexIdSessionToken(creds, { now: 500_000 });
      expect(a).toBe(token);
      expect(b).toBe(token);
      expect(logins).toBe(1); // second call served from cache
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("re-mints once the cached token is within the safety margin", async () => {
    let logins = 0;
    const realFetch = globalThis.fetch;
    const payload = btoa(JSON.stringify({ exp: 1000 }));
    const token = `h.${payload}.s`;
    globalThis.fetch = (async () => {
      logins++;
      return new Response(JSON.stringify({ token }), { status: 200 });
    }) as unknown as typeof fetch;

    try {
      await getVtexIdSessionToken(creds, { now: 0 });
      // now is past (exp*1000 - 60s margin) = 940_000ms → cache miss.
      await getVtexIdSessionToken(creds, { now: 990_000 });
      expect(logins).toBe(2);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
