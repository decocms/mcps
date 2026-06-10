import { describe, expect, test } from "bun:test";
import { issueRepoGrant, mintRepoTokenWithGrant } from "./repo-grant.ts";
import {
  getRepoGrantStore,
  parseRefreshToken,
  verifySecret,
} from "./repo-grant-store.ts";

function fakeKV() {
  const store = new Map<string, string>();
  return {
    store,
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => {
      store.set(k, v);
    },
    delete: async (k: string) => {
      store.delete(k);
    },
  };
}

describe("issueRepoGrant", () => {
  test("creates a grant and returns refresh metadata", async () => {
    const kv = fakeKV();
    const store = getRepoGrantStore(kv);
    const now = Date.parse("2026-06-10T00:00:00.000Z");

    const issued = await issueRepoGrant({
      store,
      installationId: 42,
      repositoryId: 999,
      owner: "acme",
      repo: "web",
      permissions: { contents: "write", metadata: "read" },
      clientId: "Iv1.abc",
      baseUrl: "https://github-mcp.decocms.com",
      createdByConnectionId: "conn-1",
      now,
    });

    expect(issued.tokenEndpoint).toBe(
      "https://github-mcp.decocms.com/repo-grant/token",
    );
    expect(issued.clientId).toBe("Iv1.abc");
    expect(issued.refreshTokenExpiresAt).toBe("2026-09-08T00:00:00.000Z");

    // The returned token must resolve to a stored grant whose hash it matches.
    const parsed = parseRefreshToken(issued.refreshToken);
    expect(parsed).not.toBeNull();
    const stored = await store.get(parsed!.grantId);
    expect(stored).toMatchObject({
      installationId: 42,
      repositoryId: 999,
      owner: "acme",
      repo: "web",
      permissions: { contents: "write", metadata: "read" },
      createdByConnectionId: "conn-1",
      clientId: "Iv1.abc",
      revokedAt: null,
    });
    expect(verifySecret(parsed!.secret, stored!.secretHash)).toBe(true);
  });

  test("normalizes a baseUrl with a trailing slash (no double slash)", async () => {
    const issued = await issueRepoGrant({
      store: getRepoGrantStore(fakeKV()),
      installationId: 42,
      repositoryId: 999,
      owner: "acme",
      repo: "web",
      permissions: { contents: "write", metadata: "read" },
      clientId: "Iv1.abc",
      baseUrl: "https://github-mcp.decocms.com/",
      now: Date.parse("2026-06-10T00:00:00.000Z"),
    });
    expect(issued.tokenEndpoint).toBe(
      "https://github-mcp.decocms.com/repo-grant/token",
    );
  });
});

const realFetch = globalThis.fetch;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
function setFetch(impl: (input: unknown, init?: unknown) => Promise<Response>) {
  globalThis.fetch = impl as unknown as typeof globalThis.fetch;
}
const urlOf = (i: unknown) =>
  typeof i === "string" ? i : (i as { url: string }).url;

describe("mintRepoTokenWithGrant", () => {
  test("mints a token AND issues a grant with the full output shape", async () => {
    setFetch(async (input) => {
      const url = urlOf(input);
      if (/\/user\/installations\/42\/repositories/.test(url)) {
        return json({
          repositories: [{ id: 999, name: "web", owner: { login: "acme" } }],
        });
      }
      if (url.includes("/user/installations")) {
        return json({
          installations: [{ id: 42, account: { login: "acme" } }],
        });
      }
      if (/\/app\/installations\/42\/access_tokens/.test(url)) {
        return json(
          {
            token: "ghs_minted",
            expires_at: "2026-06-10T01:00:00.000Z",
            permissions: {
              contents: "write",
              metadata: "read",
              pull_requests: "write",
            },
          },
          201,
        );
      }
      throw new Error(`unexpected url ${url}`);
    });

    const kv = fakeKV();
    const now = Date.parse("2026-06-10T00:00:00.000Z");
    const result = await mintRepoTokenWithGrant({
      callerToken: "ghu_x",
      installationId: 42,
      owner: "acme",
      repo: "web",
      clientId: "Iv1.abc",
      baseUrl: "https://github-mcp.decocms.com",
      store: getRepoGrantStore(kv),
      createdByConnectionId: "conn-1",
      jwt: "fake.jwt",
      now,
    });

    globalThis.fetch = realFetch;

    expect(result.token).toBe("ghs_minted");
    expect(result.expiresAt).toBe("2026-06-10T01:00:00.000Z");
    expect(result.expiresIn).toBe(3600);
    expect(result.tokenType).toBe("Bearer");
    expect(result.repository).toEqual({ id: 999, owner: "acme", name: "web" });
    expect(result.installationId).toBe(42);
    expect(result.tokenEndpoint).toBe(
      "https://github-mcp.decocms.com/repo-grant/token",
    );
    expect(result.clientId).toBe("Iv1.abc");
    expect(result.refreshTokenExpiresAt).toBe("2026-09-08T00:00:00.000Z");
    expect(result.refreshToken.startsWith("ghr_")).toBe(true);
    // The grant is persisted and redeemable.
    const parsed = parseRefreshToken(result.refreshToken);
    expect(await getRepoGrantStore(kv).get(parsed!.grantId)).toBeDefined();
  });
});
