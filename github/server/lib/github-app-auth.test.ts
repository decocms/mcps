import { afterEach, describe, expect, test } from "bun:test";
import {
  GitHubAppApiError,
  mintInstallationAccessToken,
} from "./github-app-auth.ts";

const realFetch = globalThis.fetch;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("mintInstallationAccessToken", () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("POSTs to the access_tokens endpoint with the App JWT and maps the response", async () => {
    let seenUrl = "";
    let seenInit: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    } = {};
    globalThis.fetch = (async (input: unknown, init: unknown) => {
      seenUrl =
        typeof input === "string" ? input : (input as { url: string }).url;
      seenInit = init as typeof seenInit;
      return json(
        {
          token: "ghs_x",
          expires_at: "2026-01-01T00:00:00Z",
          permissions: { contents: "write", metadata: "read" },
          repositories: [{ id: 1, name: "web", full_name: "acme/web" }],
        },
        201,
      );
    }) as unknown as typeof globalThis.fetch;

    const result = await mintInstallationAccessToken(
      42,
      { repository_ids: [1], permissions: { contents: "write" } },
      "fake.jwt",
    );

    expect(seenUrl).toBe(
      "https://api.github.com/app/installations/42/access_tokens",
    );
    expect(seenInit.method).toBe("POST");
    expect(seenInit.headers?.Authorization).toBe("Bearer fake.jwt");
    expect(JSON.parse(seenInit.body ?? "{}")).toEqual({
      repository_ids: [1],
      permissions: { contents: "write" },
    });
    expect(result.token).toBe("ghs_x");
    expect(result.expires_at).toBe("2026-01-01T00:00:00Z");
    expect(result.permissions).toEqual({ contents: "write", metadata: "read" });
  });

  test("throws GitHubAppApiError carrying the status on 422", async () => {
    globalThis.fetch = (async () =>
      json(
        { message: "repo not in installation" },
        422,
      )) as unknown as typeof globalThis.fetch;

    let caught: unknown;
    try {
      await mintInstallationAccessToken(42, {}, "fake.jwt");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(GitHubAppApiError);
    expect((caught as GitHubAppApiError).status).toBe(422);
  });

  test("throws GitHubAppApiError carrying the status on 404", async () => {
    globalThis.fetch = (async () =>
      new Response("not found", {
        status: 404,
      })) as unknown as typeof globalThis.fetch;

    let caught: unknown;
    try {
      await mintInstallationAccessToken(99, {}, "fake.jwt");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(GitHubAppApiError);
    expect((caught as GitHubAppApiError).status).toBe(404);
  });

  test("throws GitHubAppApiError on 401 (bad JWT)", async () => {
    globalThis.fetch = (async () =>
      json(
        { message: "A JSON web token could not be decoded" },
        401,
      )) as unknown as typeof globalThis.fetch;

    let caught: unknown;
    try {
      await mintInstallationAccessToken(42, {}, "fake.jwt");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(GitHubAppApiError);
    expect((caught as GitHubAppApiError).status).toBe(401);
  });
});
