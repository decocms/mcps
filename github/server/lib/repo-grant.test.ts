import { describe, expect, test } from "bun:test";
import { issueRepoGrant } from "./repo-grant.ts";
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
});
