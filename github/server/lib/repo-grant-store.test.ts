import { describe, expect, test } from "bun:test";
import {
  formatRefreshToken,
  generateGrantCredentials,
  getRepoGrantStore,
  hashSecret,
  parseRefreshToken,
  setRepoGrantKV,
  verifySecret,
  type RepoGrantMetadata,
} from "./repo-grant-store.ts";

describe("refresh token format", () => {
  test("formats and round-trips a token", () => {
    const token = formatRefreshToken("a".repeat(32), "secretvalue");
    expect(token).toBe(`ghr_${"a".repeat(32)}.secretvalue`);
    const parsed = parseRefreshToken(token);
    expect(parsed).toEqual({ grantId: "a".repeat(32), secret: "secretvalue" });
  });

  test("rejects tokens without the ghr_ prefix", () => {
    expect(parseRefreshToken(`${"a".repeat(32)}.secret`)).toBeNull();
  });

  test("rejects tokens with a non-hex / wrong-length grantId", () => {
    expect(parseRefreshToken("ghr_zzz.secret")).toBeNull();
    expect(parseRefreshToken("ghr_abc.secret")).toBeNull();
  });

  test("rejects tokens missing the secret", () => {
    expect(parseRefreshToken(`ghr_${"a".repeat(32)}.`)).toBeNull();
    expect(parseRefreshToken(`ghr_${"a".repeat(32)}`)).toBeNull();
  });

  test("keeps a secret that itself contains base64url chars", () => {
    const parsed = parseRefreshToken(`ghr_${"b".repeat(32)}.aB-_0.9`);
    // split on the FIRST dot only
    expect(parsed).toEqual({ grantId: "b".repeat(32), secret: "aB-_0.9" });
  });
});

describe("secret hashing", () => {
  test("hashSecret is deterministic and 64 hex chars", () => {
    const h = hashSecret("hello");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSecret("hello")).toBe(h);
  });

  test("verifySecret accepts the right secret and rejects others", () => {
    const h = hashSecret("right");
    expect(verifySecret("right", h)).toBe(true);
    expect(verifySecret("wrong", h)).toBe(false);
  });

  test("verifySecret is false on a malformed stored hash", () => {
    expect(verifySecret("x", "not-hex")).toBe(false);
  });
});

describe("generateGrantCredentials", () => {
  test("produces a parseable token whose secret matches its hash", () => {
    const c = generateGrantCredentials();
    expect(c.grantId).toMatch(/^[0-9a-f]{32}$/);
    const parsed = parseRefreshToken(c.refreshToken);
    expect(parsed?.grantId).toBe(c.grantId);
    expect(verifySecret(parsed!.secret, c.secretHash)).toBe(true);
  });

  test("produces unique grantIds across calls", () => {
    expect(generateGrantCredentials().grantId).not.toBe(
      generateGrantCredentials().grantId,
    );
  });
});

function fakeKV() {
  const store = new Map<string, string>();
  const ttls = new Map<string, number | undefined>();
  return {
    store,
    ttls,
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string, o?: { expirationTtl?: number }) => {
      store.set(k, v);
      ttls.set(k, o?.expirationTtl);
    },
    delete: async (k: string) => {
      store.delete(k);
    },
  };
}

const sampleMeta = (
  over: Partial<RepoGrantMetadata> = {},
): RepoGrantMetadata => ({
  grantId: "f".repeat(32),
  secretHash: hashSecret("s"),
  installationId: 42,
  repositoryId: 999,
  owner: "acme",
  repo: "web",
  permissions: { contents: "write", metadata: "read" },
  createdAt: "2026-06-10T00:00:00.000Z",
  expiresAt: "2026-09-08T00:00:00.000Z",
  revokedAt: null,
  createdByConnectionId: "conn-1",
  clientId: "Iv1.abc",
  ...over,
});

describe("Kv-backed grant store", () => {
  test("create writes under grant:<id> with the 90-day TTL", async () => {
    const kv = fakeKV();
    const store = getRepoGrantStore(kv);
    const meta = sampleMeta();
    await store.create(meta);
    expect(kv.store.has(`grant:${meta.grantId}`)).toBe(true);
    expect(kv.ttls.get(`grant:${meta.grantId}`)).toBe(90 * 24 * 60 * 60);
    expect(await store.get(meta.grantId)).toEqual(meta);
  });

  test("get returns undefined for an unknown id and for corrupt JSON", async () => {
    const kv = fakeKV();
    const store = getRepoGrantStore(kv);
    expect(await store.get("0".repeat(32))).toBeUndefined();
    await kv.put("grant:bad", "{not-json");
    expect(await store.get("bad")).toBeUndefined();
  });

  test("touch slides expiresAt and re-sets the TTL", async () => {
    const kv = fakeKV();
    const store = getRepoGrantStore(kv);
    const meta = sampleMeta();
    await store.create(meta);
    await store.touch(meta.grantId, "2026-12-01T00:00:00.000Z");
    const updated = await store.get(meta.grantId);
    expect(updated?.expiresAt).toBe("2026-12-01T00:00:00.000Z");
    expect(kv.ttls.get(`grant:${meta.grantId}`)).toBe(90 * 24 * 60 * 60);
  });

  test("touch on a missing grant is a no-op", async () => {
    const kv = fakeKV();
    const store = getRepoGrantStore(kv);
    await store.touch("0".repeat(32), "2026-12-01T00:00:00.000Z");
    expect(await store.get("0".repeat(32))).toBeUndefined();
  });

  test("revoke deletes the grant", async () => {
    const kv = fakeKV();
    const store = getRepoGrantStore(kv);
    const meta = sampleMeta();
    await store.create(meta);
    await store.revoke(meta.grantId);
    expect(await store.get(meta.grantId)).toBeUndefined();
  });
});

describe("store selection", () => {
  test("falls back to a shared in-memory store when no KV is present", async () => {
    setRepoGrantKV(undefined);
    const store = getRepoGrantStore();
    const meta = sampleMeta({ grantId: "1".repeat(32) });
    await store.create(meta);
    // Same module-level memory store is returned on the next call.
    expect(await getRepoGrantStore().get(meta.grantId)).toEqual(meta);
  });

  test("uses the per-request KV singleton set via setRepoGrantKV", async () => {
    const kv = fakeKV();
    setRepoGrantKV(kv);
    const meta = sampleMeta({ grantId: "2".repeat(32) });
    await getRepoGrantStore().create(meta);
    expect(kv.store.has(`grant:${meta.grantId}`)).toBe(true);
    setRepoGrantKV(undefined); // reset for other tests
  });
});
