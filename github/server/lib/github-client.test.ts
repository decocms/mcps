import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { OAuthInvalidGrantError } from "@decocms/runtime";
import {
  refreshAccessToken,
  scopeUserAccessTokenToRepository,
} from "./github-client.ts";

const realFetch = globalThis.fetch;

type FetchMock = (
  input: Request | URL | string,
  init?: RequestInit,
) => Promise<Response>;

function mockFetch(impl: FetchMock) {
  globalThis.fetch = impl as typeof globalThis.fetch;
}

describe("refreshAccessToken", () => {
  beforeEach(() => {
    globalThis.fetch = realFetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("throws OAuthInvalidGrantError when GitHub returns 200 with error=invalid_grant", async () => {
    mockFetch(
      async () =>
        new Response(
          JSON.stringify({
            error: "invalid_grant",
            error_description:
              "The refresh token has expired or has been revoked",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );

    let caught: unknown;
    try {
      await refreshAccessToken("rt", "client_id", "client_secret");
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(OAuthInvalidGrantError);
    const typed = caught as OAuthInvalidGrantError;
    expect(typed.error).toBe("invalid_grant");
    expect(typed.errorDescription).toBe(
      "The refresh token has expired or has been revoked",
    );
  });

  test("throws OAuthInvalidGrantError when GitHub returns error=bad_refresh_token", async () => {
    mockFetch(
      async () =>
        new Response(JSON.stringify({ error: "bad_refresh_token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );

    let caught: unknown;
    try {
      await refreshAccessToken("rt", "client_id", "client_secret");
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(OAuthInvalidGrantError);
    expect((caught as OAuthInvalidGrantError).error).toBe("bad_refresh_token");
  });

  test("throws OAuthInvalidGrantError on 400 invalid_grant", async () => {
    mockFetch(
      async () =>
        new Response(JSON.stringify({ error: "invalid_grant" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
    );

    let caught: unknown;
    try {
      await refreshAccessToken("rt", "client_id", "client_secret");
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(OAuthInvalidGrantError);
  });

  test("throws plain Error (not OAuthInvalidGrantError) on 5xx", async () => {
    mockFetch(
      async () =>
        new Response("Bad Gateway", {
          status: 502,
          headers: { "Content-Type": "text/plain" },
        }),
    );

    let caught: unknown;
    try {
      await refreshAccessToken("rt", "client_id", "client_secret");
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(OAuthInvalidGrantError);
  });

  test("propagates plain Error on network failure", async () => {
    mockFetch(async () => {
      throw new Error("network down");
    });

    let caught: unknown;
    try {
      await refreshAccessToken("rt", "client_id", "client_secret");
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(OAuthInvalidGrantError);
    expect((caught as Error).message).toBe("network down");
  });

  test("returns token response on success", async () => {
    mockFetch(
      async () =>
        new Response(
          JSON.stringify({
            access_token: "new-access",
            token_type: "Bearer",
            expires_in: 28800,
            refresh_token: "new-refresh",
            refresh_token_expires_in: 15897600,
            scope: "repo",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );

    const result = await refreshAccessToken("rt", "client_id", "client_secret");

    expect(result.access_token).toBe("new-access");
    expect(result.refresh_token).toBe("new-refresh");
    expect(result.scope).toBe("repo");
  });
});

describe("scopeUserAccessTokenToRepository", () => {
  beforeEach(() => {
    globalThis.fetch = realFetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("uses GitHub App basic auth for /token/scoped", async () => {
    let authHeader: string | null = null;
    let requestBody: Record<string, unknown> | null = null;

    mockFetch(async (_input, init) => {
      const headers = new Headers(init?.headers);
      authHeader = headers.get("Authorization");
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({ token: "scoped-token", expires_in: 28800 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const result = await scopeUserAccessTokenToRepository(
      "ghu_user_token",
      "Iv1.client",
      "client_secret",
      { repositoryId: 1016852701, target: "deco" },
    );

    expect(result.token).toBe("scoped-token");
    expect(authHeader).toBe(
      `Basic ${Buffer.from("Iv1.client:client_secret").toString("base64")}`,
    );
    expect(requestBody).toEqual({
      access_token: "ghu_user_token",
      target: "deco",
      repository_ids: [1016852701],
    });
  });
});
