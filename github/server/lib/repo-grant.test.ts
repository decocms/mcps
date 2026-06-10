import { afterEach, describe, expect, test } from "bun:test";
import {
  issueRepoGrant,
  mintRepoTokenWithGrant,
  refreshRepoGrant,
} from "./repo-grant.ts";
import {
  generateGrantCredentials,
  getRepoGrantStore,
  parseRefreshToken,
  type RepoGrantMetadata,
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

// Restore the real fetch after every test so a monkeypatched mock can never
// leak into a later test in this file (which Tasks 7-8 also fetch-mock).
afterEach(() => {
  globalThis.fetch = realFetch;
});

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

async function seedGrant(
  store: ReturnType<typeof getRepoGrantStore>,
  over: Partial<RepoGrantMetadata> = {},
) {
  const creds = generateGrantCredentials();
  const meta: RepoGrantMetadata = {
    grantId: creds.grantId,
    secretHash: creds.secretHash,
    installationId: 42,
    repositoryId: 999,
    owner: "acme",
    repo: "web",
    permissions: { contents: "write", metadata: "read" },
    createdAt: "2026-06-10T00:00:00.000Z",
    expiresAt: "2026-09-08T00:00:00.000Z",
    revokedAt: null,
    clientId: "Iv1.abc",
    ...over,
  };
  await store.create(meta);
  return { creds, meta };
}

describe("refreshRepoGrant — request validation", () => {
  test("missing grant_type or refresh_token → 400 invalid_request", async () => {
    const store = getRepoGrantStore(fakeKV());
    const r = await refreshRepoGrant({
      store,
      grantType: null,
      refreshToken: null,
      clientId: null,
      expectedClientId: "Iv1.abc",
    });
    expect(r).toMatchObject({
      ok: false,
      status: 400,
      error: "invalid_request",
    });
  });

  test("unsupported grant_type → 400 unsupported_grant_type", async () => {
    const store = getRepoGrantStore(fakeKV());
    const r = await refreshRepoGrant({
      store,
      grantType: "authorization_code",
      refreshToken: "ghr_x.y",
      clientId: null,
      expectedClientId: "Iv1.abc",
    });
    expect(r).toMatchObject({
      ok: false,
      status: 400,
      error: "unsupported_grant_type",
    });
  });

  test("mismatched client_id → 400 invalid_client", async () => {
    const store = getRepoGrantStore(fakeKV());
    const r = await refreshRepoGrant({
      store,
      grantType: "refresh_token",
      refreshToken: "ghr_x.y",
      clientId: "WRONG",
      expectedClientId: "Iv1.abc",
    });
    expect(r).toMatchObject({
      ok: false,
      status: 400,
      error: "invalid_client",
    });
  });
});

describe("refreshRepoGrant — grant validity (permanent failures)", () => {
  test("unparseable refresh_token → 400 invalid_grant", async () => {
    const store = getRepoGrantStore(fakeKV());
    const r = await refreshRepoGrant({
      store,
      grantType: "refresh_token",
      refreshToken: "not-a-token",
      clientId: "Iv1.abc",
      expectedClientId: "Iv1.abc",
    });
    expect(r).toMatchObject({ ok: false, status: 400, error: "invalid_grant" });
  });

  test("unknown grant → 400 invalid_grant", async () => {
    const store = getRepoGrantStore(fakeKV());
    const creds = generateGrantCredentials();
    const r = await refreshRepoGrant({
      store,
      grantType: "refresh_token",
      refreshToken: creds.refreshToken,
      clientId: "Iv1.abc",
      expectedClientId: "Iv1.abc",
    });
    expect(r).toMatchObject({ ok: false, status: 400, error: "invalid_grant" });
  });

  test("wrong secret → 400 invalid_grant", async () => {
    const store = getRepoGrantStore(fakeKV());
    const { meta } = await seedGrant(store);
    const r = await refreshRepoGrant({
      store,
      grantType: "refresh_token",
      refreshToken: `ghr_${meta.grantId}.WRONGSECRET`,
      clientId: "Iv1.abc",
      expectedClientId: "Iv1.abc",
    });
    expect(r).toMatchObject({ ok: false, status: 400, error: "invalid_grant" });
  });

  test("revoked grant → 400 invalid_grant", async () => {
    const store = getRepoGrantStore(fakeKV());
    const { creds } = await seedGrant(store, {
      revokedAt: "2026-06-11T00:00:00.000Z",
    });
    const r = await refreshRepoGrant({
      store,
      grantType: "refresh_token",
      refreshToken: creds.refreshToken,
      clientId: "Iv1.abc",
      expectedClientId: "Iv1.abc",
    });
    expect(r).toMatchObject({ ok: false, status: 400, error: "invalid_grant" });
  });

  test("expired grant → 400 invalid_grant and the grant is deleted", async () => {
    const kv = fakeKV();
    const store = getRepoGrantStore(kv);
    const { creds, meta } = await seedGrant(store, {
      expiresAt: "2026-06-09T00:00:00.000Z",
    });
    const r = await refreshRepoGrant({
      store,
      grantType: "refresh_token",
      refreshToken: creds.refreshToken,
      clientId: "Iv1.abc",
      expectedClientId: "Iv1.abc",
      now: Date.parse("2026-06-10T00:00:00.000Z"),
    });
    expect(r).toMatchObject({ ok: false, status: 400, error: "invalid_grant" });
    expect(kv.store.has(`grant:${meta.grantId}`)).toBe(false);
  });
});

describe("refreshRepoGrant — minting", () => {
  test("valid grant → 200 OAuth response, stable refresh_token, slid TTL", async () => {
    const kv = fakeKV();
    const store = getRepoGrantStore(kv);
    const now = Date.parse("2026-06-10T00:00:00.000Z");
    const { creds, meta } = await seedGrant(store);

    setFetch(async (input, init) => {
      const url = urlOf(input);
      if (/\/app\/installations\/42\/access_tokens/.test(url)) {
        const body = JSON.parse((init as { body?: string }).body ?? "{}");
        expect(body.repository_ids).toEqual([999]);
        expect(body.permissions).toEqual({
          contents: "write",
          metadata: "read",
        });
        return json(
          {
            token: "ghs_fresh",
            expires_at: "2026-06-10T01:00:00.000Z",
            permissions: body.permissions,
          },
          201,
        );
      }
      throw new Error(`unexpected url ${url}`);
    });

    const r = await refreshRepoGrant({
      store,
      grantType: "refresh_token",
      refreshToken: creds.refreshToken,
      clientId: "Iv1.abc",
      expectedClientId: "Iv1.abc",
      now,
      jwt: "fake.jwt",
    });

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.success).toEqual({
      access_token: "ghs_fresh",
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: creds.refreshToken,
      scope: "github-app-installation:42 repo:acme/web",
    });
    // TTL slid forward 90 days from `now`.
    const stored = await store.get(meta.grantId);
    expect(stored?.expiresAt).toBe("2026-09-08T00:00:00.000Z");
  });

  test("omitted client_id is allowed (public-client model)", async () => {
    const store = getRepoGrantStore(fakeKV());
    const { creds } = await seedGrant(store);
    setFetch(async () =>
      json(
        {
          token: "ghs_fresh",
          expires_at: "2026-06-10T01:00:00.000Z",
          permissions: { contents: "write", metadata: "read" },
        },
        201,
      ),
    );
    const r = await refreshRepoGrant({
      store,
      grantType: "refresh_token",
      refreshToken: creds.refreshToken,
      clientId: null,
      expectedClientId: "Iv1.abc",
      jwt: "fake.jwt",
    });
    expect(r.ok).toBe(true);
  });

  test("GitHub 422 → 400 invalid_grant and grant deleted", async () => {
    const kv = fakeKV();
    const store = getRepoGrantStore(kv);
    const { creds, meta } = await seedGrant(store);
    setFetch(async () => json({ message: "repo gone" }, 422));
    const r = await refreshRepoGrant({
      store,
      grantType: "refresh_token",
      refreshToken: creds.refreshToken,
      clientId: "Iv1.abc",
      expectedClientId: "Iv1.abc",
      jwt: "fake.jwt",
    });
    expect(r).toMatchObject({ ok: false, status: 400, error: "invalid_grant" });
    expect(kv.store.has(`grant:${meta.grantId}`)).toBe(false);
  });

  test("GitHub 404 (installation gone) → 400 invalid_grant and grant deleted", async () => {
    const kv = fakeKV();
    const store = getRepoGrantStore(kv);
    const { creds, meta } = await seedGrant(store);
    setFetch(async () => json({ message: "not found" }, 404));
    const r = await refreshRepoGrant({
      store,
      grantType: "refresh_token",
      refreshToken: creds.refreshToken,
      clientId: "Iv1.abc",
      expectedClientId: "Iv1.abc",
      jwt: "fake.jwt",
    });
    expect(r).toMatchObject({ ok: false, status: 400, error: "invalid_grant" });
    expect(kv.store.has(`grant:${meta.grantId}`)).toBe(false);
  });

  test("GitHub 503 → 503 temporarily_unavailable and grant KEPT", async () => {
    const kv = fakeKV();
    const store = getRepoGrantStore(kv);
    const { creds, meta } = await seedGrant(store);
    setFetch(async () => json({ message: "down" }, 503));
    const r = await refreshRepoGrant({
      store,
      grantType: "refresh_token",
      refreshToken: creds.refreshToken,
      clientId: "Iv1.abc",
      expectedClientId: "Iv1.abc",
      jwt: "fake.jwt",
    });
    expect(r).toMatchObject({
      ok: false,
      status: 503,
      error: "temporarily_unavailable",
    });
    expect(kv.store.has(`grant:${meta.grantId}`)).toBe(true);
  });

  test("GitHub 401 (our App misconfig) → 503, NOT invalid_grant, grant KEPT", async () => {
    const kv = fakeKV();
    const store = getRepoGrantStore(kv);
    const { creds, meta } = await seedGrant(store);
    setFetch(async () => json({ message: "bad jwt" }, 401));
    const r = await refreshRepoGrant({
      store,
      grantType: "refresh_token",
      refreshToken: creds.refreshToken,
      clientId: "Iv1.abc",
      expectedClientId: "Iv1.abc",
      jwt: "fake.jwt",
    });
    expect(r).toMatchObject({
      ok: false,
      status: 503,
      error: "temporarily_unavailable",
    });
    expect(kv.store.has(`grant:${meta.grantId}`)).toBe(true);
  });
});
