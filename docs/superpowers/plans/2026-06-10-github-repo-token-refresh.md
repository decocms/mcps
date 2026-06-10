# GitHub Repo-Token Synthetic OAuth Refresh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the GitHub MCP's `MINT_REPO_TOKEN` tool issue a durable, revocable synthetic refresh token alongside the short-lived `ghs_` token, and add OAuth-shaped `POST /repo-grant/token` (refresh) and `POST /repo-grant/revoke` endpoints that re-mint repo-scoped installation tokens using only GitHub App credentials — no user-to-server token at refresh time.

**Architecture:** A new `REPO_GRANTS` Cloudflare KV namespace stores opaque grant metadata keyed by a random `grantId`, with the secret hashed at rest (SHA-256, constant-time verify) and a sliding 90-day TTL. The refresh token is the stable opaque string `ghr_<grantId>.<secret>`. The two new HTTP endpoints are routed in `main.ts`'s `handle()` interceptor (before `runtime.fetch`), under `/repo-grant/*` to avoid colliding with the deco runtime's own `/oauth/*` routes. Refresh re-signs a GitHub App JWT and calls `POST /app/installations/:id/access_tokens` with `repository_ids` + stored permissions; GitHub's own 422/404 maps to permanent `invalid_grant`, while 5xx/429/our-side config errors map to transient `temporarily_unavailable`.

**Tech Stack:** TypeScript, Cloudflare Workers (`nodejs_compat`), `node:crypto`, Zod, `@decocms/runtime` (`createPrivateTool`), `bun:test`.

**Spec:** `docs/superpowers/specs/2026-06-10-github-repo-token-refresh-design.md`

**Conventions:**
- All commands run from the `github/` directory unless noted: `cd github`.
- Tests: `bun test <path>`. Typecheck: `bun run check`. Format: `bun run fmt`.
- Commit messages use conventional commits scoped `(github)`. If the pre-commit hook fails because `oxfmt` is not installed in this worktree, run `bun run fmt` first; if it still fails on the missing binary, commit with `--no-verify` (changes are covered by `bun run check` + `bun test`).

---

## Task 0: Install dependencies (prerequisite)

**Files:** none (environment setup)

- [ ] **Step 1: Install workspace dependencies**

The worktree has no `node_modules`. The pure-`lib` tests only need `node:crypto`, but typecheck (`tsc`) and the tool/`main.ts` need the workspace deps.

Run (from repo root):
```bash
bun install
```
Expected: completes, creating `node_modules/`. (If it fails on network, the `lib` + test tasks can still proceed; only `bun run check` and the final build need deps.)

- [ ] **Step 2: Baseline the existing tests pass**

Run:
```bash
cd github && bun test
```
Expected: existing suites (`github-app-auth.test.ts`, `github-client.test.ts`, `repo-token.test.ts`) PASS. This is the green baseline.

---

## Task 1: Constants + env types

**Files:**
- Create: `github/server/constants.ts`
- Modify: `github/server/types/env.ts`

- [ ] **Step 1: Create the constants module**

Create `github/server/constants.ts`:
```ts
/**
 * Shared constants for the GitHub MCP synthetic repo-grant refresh flow.
 */

/** Public origin of this MCP (custom-domain route in wrangler.toml). Used to
 * build the absolute `tokenEndpoint` returned by MINT_REPO_TOKEN. Overridable
 * via the PUBLIC_BASE_URL env var. */
export const DEFAULT_PUBLIC_BASE_URL = "https://github-mcp.decocms.com";

/** Sliding lifetime of a repo grant, in seconds (90 days). Each successful
 * refresh extends expiry by this much; also used as the KV expirationTtl so
 * orphaned grants self-expire. */
export const GRANT_TTL_SECONDS = 90 * 24 * 60 * 60;

/** Path of the synthetic OAuth refresh-token endpoint. Namespaced under
 * /repo-grant/* (NOT /oauth/*) to avoid colliding with the deco runtime's own
 * /oauth/start|callback|logout routes, which handle() intercepts before. */
export const REPO_GRANT_TOKEN_PATH = "/repo-grant/token";

/** Path of the RFC 7009-style revoke endpoint. */
export const REPO_GRANT_REVOKE_PATH = "/repo-grant/revoke";

/** KV key prefix for stored grants: `grant:<grantId>`. */
export const GRANT_KEY_PREFIX = "grant:";

/** Opaque refresh-token prefix: `ghr_<grantId>.<secret>`. */
export const REFRESH_TOKEN_PREFIX = "ghr_";
```

- [ ] **Step 2: Extend the Env type**

In `github/server/types/env.ts`, update the `KVNamespace` interface so `put` accepts the Cloudflare options arg (needed for `expirationTtl`), and add the two new bindings.

Replace the `put` line in the `KVNamespace` interface:
```ts
  put(key: string, value: string): Promise<void>;
```
with:
```ts
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
```

Then, in the `Env` type, add `REPO_GRANTS` and `PUBLIC_BASE_URL`:
```ts
export type Env = DefaultEnv<typeof StateSchema, Registry> & {
  INSTALLATIONS?: KVNamespace;
  REPO_GRANTS?: KVNamespace;
  GITHUB_APP_ID?: string;
  GITHUB_PRIVATE_KEY?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GITHUB_WEBHOOK_SECRET?: string;
  PUBLIC_BASE_URL?: string;
};
```

- [ ] **Step 3: Typecheck**

Run:
```bash
cd github && bun run check
```
Expected: PASS (no new type errors). If deps failed to install in Task 0, skip and rely on later tasks; note it.

- [ ] **Step 4: Commit**

```bash
cd github && git add server/constants.ts server/types/env.ts
git commit -m "feat(github): add repo-grant constants and REPO_GRANTS env binding"
```

---

## Task 2: Grant token format + hashing helpers

**Files:**
- Create: `github/server/lib/repo-grant-store.ts`
- Test: `github/server/lib/repo-grant-store.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `github/server/lib/repo-grant-store.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import {
  formatRefreshToken,
  generateGrantCredentials,
  hashSecret,
  parseRefreshToken,
  verifySecret,
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
cd github && bun test server/lib/repo-grant-store.test.ts
```
Expected: FAIL — `Cannot find module './repo-grant-store.ts'`.

- [ ] **Step 3: Implement the helpers**

Create `github/server/lib/repo-grant-store.ts`:
```ts
/**
 * Repo-grant storage + opaque refresh-token helpers.
 *
 * A synthetic refresh token is the stable opaque string `ghr_<grantId>.<secret>`.
 * Only the SHA-256 hash of <secret> is persisted; the plaintext is returned to
 * the caller exactly once. Grants are keyed by <grantId> in the REPO_GRANTS KV
 * namespace and verified with a constant-time hash comparison.
 */

import crypto from "node:crypto";
import {
  GRANT_KEY_PREFIX,
  GRANT_TTL_SECONDS,
  REFRESH_TOKEN_PREFIX,
} from "../constants.ts";

export interface RepoGrantMetadata {
  grantId: string;
  secretHash: string;
  installationId: number;
  repositoryId: number;
  owner: string;
  repo: string;
  permissions: Record<string, string>;
  createdAt: string;
  expiresAt: string | null;
  revokedAt?: string | null;
  createdByConnectionId?: string;
  clientId: string;
}

export interface NewGrantCredentials {
  grantId: string;
  secret: string;
  secretHash: string;
  refreshToken: string;
}

/** Generate a fresh grant id + 256-bit secret, plus the secret's hash and the
 * formatted opaque refresh token. */
export function generateGrantCredentials(): NewGrantCredentials {
  const grantId = crypto.randomBytes(16).toString("hex");
  const secret = crypto.randomBytes(32).toString("base64url");
  const secretHash = hashSecret(secret);
  return { grantId, secret, secretHash, refreshToken: formatRefreshToken(grantId, secret) };
}

/** SHA-256 of the secret, hex-encoded. */
export function hashSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

/** Constant-time comparison of a presented secret against a stored hash. */
export function verifySecret(secret: string, secretHash: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(secretHash)) return false;
  const a = Buffer.from(hashSecret(secret), "hex");
  const b = Buffer.from(secretHash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Opaque refresh token: `ghr_<grantId>.<secret>`. */
export function formatRefreshToken(grantId: string, secret: string): string {
  return `${REFRESH_TOKEN_PREFIX}${grantId}.${secret}`;
}

/** Parse `ghr_<grantId>.<secret>`; returns null if the shape is wrong. Splits
 * on the FIRST dot, so a base64url secret containing dots is preserved. */
export function parseRefreshToken(
  token: string,
): { grantId: string; secret: string } | null {
  if (!token.startsWith(REFRESH_TOKEN_PREFIX)) return null;
  const body = token.slice(REFRESH_TOKEN_PREFIX.length);
  const dot = body.indexOf(".");
  if (dot <= 0 || dot === body.length - 1) return null;
  const grantId = body.slice(0, dot);
  const secret = body.slice(dot + 1);
  if (!/^[0-9a-f]{32}$/.test(grantId)) return null;
  if (secret.length === 0) return null;
  return { grantId, secret };
}

// --- store interface + implementations come in Task 3 (same file) ---

const _keyOf = (grantId: string): string => `${GRANT_KEY_PREFIX}${grantId}`;
// _keyOf and GRANT_TTL_SECONDS are used by the store added in Task 3.
void _keyOf;
void GRANT_TTL_SECONDS;
```

> Note: the trailing `_keyOf`/`void` lines are scaffolding so this file type-checks on its own; Task 3 replaces them with the real store and removes the `void` statements.

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
cd github && bun test server/lib/repo-grant-store.test.ts
```
Expected: PASS (all `describe` blocks green).

- [ ] **Step 5: Commit**

```bash
cd github && git add server/lib/repo-grant-store.ts server/lib/repo-grant-store.test.ts
git commit -m "feat(github): add repo-grant token format + hashing helpers"
```

---

## Task 3: Grant store (Memory + KV + per-request singleton)

**Files:**
- Modify: `github/server/lib/repo-grant-store.ts`
- Test: `github/server/lib/repo-grant-store.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `github/server/lib/repo-grant-store.test.ts`:
```ts
import {
  getRepoGrantStore,
  setRepoGrantKV,
  type RepoGrantMetadata,
} from "./repo-grant-store.ts";

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

const sampleMeta = (over: Partial<RepoGrantMetadata> = {}): RepoGrantMetadata => ({
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
cd github && bun test server/lib/repo-grant-store.test.ts
```
Expected: FAIL — `getRepoGrantStore`/`setRepoGrantKV` are not exported.

- [ ] **Step 3: Implement the store**

In `github/server/lib/repo-grant-store.ts`, remove the Task-2 scaffolding lines:
```ts
const _keyOf = (grantId: string): string => `${GRANT_KEY_PREFIX}${grantId}`;
// _keyOf and GRANT_TTL_SECONDS are used by the store added in Task 3.
void _keyOf;
void GRANT_TTL_SECONDS;
```
and replace them with:
```ts
interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface RepoGrantStore {
  create(meta: RepoGrantMetadata): Promise<void>;
  get(grantId: string): Promise<RepoGrantMetadata | undefined>;
  /** Slide expiry forward and re-persist (resets the KV TTL). */
  touch(grantId: string, expiresAt: string): Promise<void>;
  /** Permanently remove a grant. */
  revoke(grantId: string): Promise<void>;
}

const keyOf = (grantId: string): string => `${GRANT_KEY_PREFIX}${grantId}`;

class KvRepoGrantStore implements RepoGrantStore {
  constructor(private kv: KVNamespaceLike) {}

  async create(meta: RepoGrantMetadata): Promise<void> {
    await this.kv.put(keyOf(meta.grantId), JSON.stringify(meta), {
      expirationTtl: GRANT_TTL_SECONDS,
    });
  }

  async get(grantId: string): Promise<RepoGrantMetadata | undefined> {
    const raw = await this.kv.get(keyOf(grantId));
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as RepoGrantMetadata;
    } catch {
      return undefined;
    }
  }

  async touch(grantId: string, expiresAt: string): Promise<void> {
    const existing = await this.get(grantId);
    if (!existing) return;
    await this.kv.put(
      keyOf(grantId),
      JSON.stringify({ ...existing, expiresAt }),
      { expirationTtl: GRANT_TTL_SECONDS },
    );
  }

  async revoke(grantId: string): Promise<void> {
    await this.kv.delete(keyOf(grantId));
  }
}

class MemoryRepoGrantStore implements RepoGrantStore {
  private map = new Map<string, RepoGrantMetadata>();
  async create(meta: RepoGrantMetadata): Promise<void> {
    this.map.set(meta.grantId, meta);
  }
  async get(grantId: string): Promise<RepoGrantMetadata | undefined> {
    return this.map.get(grantId);
  }
  async touch(grantId: string, expiresAt: string): Promise<void> {
    const existing = this.map.get(grantId);
    if (existing) this.map.set(grantId, { ...existing, expiresAt });
  }
  async revoke(grantId: string): Promise<void> {
    this.map.delete(grantId);
  }
}

const memoryStore = new MemoryRepoGrantStore();

// Per-request KV binding, threaded from handle() the same way trigger-store
// does. The binding object is stable per isolate, so concurrent requests
// sharing it is safe.
let currentKV: KVNamespaceLike | undefined;

export function setRepoGrantKV(kv: KVNamespaceLike | undefined): void {
  currentKV = kv;
}

/** Resolve a grant store. An explicit `kv` (e.g. from an HTTP handler that has
 * `env`) wins; otherwise the per-request singleton; otherwise the dev memory
 * store. */
export function getRepoGrantStore(kv?: KVNamespaceLike): RepoGrantStore {
  const ns = kv ?? currentKV;
  return ns ? new KvRepoGrantStore(ns) : memoryStore;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
cd github && bun test server/lib/repo-grant-store.test.ts
```
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
cd github && git add server/lib/repo-grant-store.ts server/lib/repo-grant-store.test.ts
git commit -m "feat(github): add KV-backed repo-grant store with sliding TTL"
```

---

## Task 4: `mintRepoScopedToken` returns `repositoryId` + cross-checks input

**Files:**
- Modify: `github/server/lib/repo-token.ts:330-395`
- Test: `github/server/lib/repo-token.test.ts`

- [ ] **Step 1: Update the existing success test + add a cross-check test**

In `github/server/lib/repo-token.test.ts`, the existing test `"mints a repo-scoped token end to end with the expected output shape"` asserts the full result. Update its `expect(result).toEqual({...})` to include `repositoryId`:
```ts
    expect(result).toEqual({
      token: "ghs_minted",
      expiresAt: "2026-06-05T12:00:00Z",
      permissions: {
        contents: "write",
        metadata: "read",
        pull_requests: "write",
      },
      repository: { owner: "acme", name: "web" },
      installationId: 42,
      repositoryId: 999,
    });
```

Then add two new tests inside the existing `describe("mintRepoScopedToken", ...)` block:
```ts
  test("accepts a matching repositoryId and mints with it", async () => {
    setFetch(async (input) => {
      const url = urlOf(input);
      if (/\/user\/installations\/42\/repositories/.test(url)) {
        return json({
          repositories: [{ id: 999, name: "web", owner: { login: "acme" } }],
        });
      }
      if (url.includes("/user/installations")) {
        return json({ installations: [{ id: 42, account: { login: "acme" } }] });
      }
      if (/access_tokens/.test(url)) {
        return json(
          { token: "ghs_ok", expires_at: "2026-06-05T12:00:00Z", permissions: {} },
          201,
        );
      }
      throw new Error(`unexpected url ${url}`);
    });
    const result = await mintRepoScopedToken({
      callerToken: "ghu_x",
      installationId: 42,
      owner: "acme",
      repo: "web",
      repositoryId: 999,
      jwt: "fake.jwt",
    });
    expect(result.repositoryId).toBe(999);
  });

  test("rejects a repositoryId that does not match the resolved repo", async () => {
    let mintCalled = false;
    setFetch(async (input) => {
      const url = urlOf(input);
      if (/\/user\/installations\/42\/repositories/.test(url)) {
        return json({
          repositories: [{ id: 999, name: "web", owner: { login: "acme" } }],
        });
      }
      if (url.includes("/user/installations")) {
        return json({ installations: [{ id: 42, account: { login: "acme" } }] });
      }
      if (/access_tokens/.test(url)) {
        mintCalled = true;
        return json({ token: "ghs_nope" }, 201);
      }
      throw new Error(`unexpected url ${url}`);
    });
    await expectRejectCode(
      () =>
        mintRepoScopedToken({
          callerToken: "ghu_x",
          installationId: 42,
          owner: "acme",
          repo: "web",
          repositoryId: 5,
          jwt: "fake.jwt",
        }),
      "invalid_input",
    );
    expect(mintCalled).toBe(false);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
cd github && bun test server/lib/repo-token.test.ts
```
Expected: FAIL — the updated `toEqual` expects `repositoryId` (missing from result), and the cross-check test mints when it should reject.

- [ ] **Step 3: Implement the change**

In `github/server/lib/repo-token.ts`, add `repositoryId` to the result interface:
```ts
export interface RepoTokenResult {
  token: string;
  expiresAt: string;
  permissions: Record<string, string>;
  repository: { owner: string; name: string };
  installationId: number;
  repositoryId: number;
}
```

Then update `mintRepoScopedToken` to accept and cross-check `repositoryId`. Replace the function body from its signature through the `return` with:
```ts
export async function mintRepoScopedToken(params: {
  callerToken: string;
  installationId: number;
  owner: string;
  repo: string;
  permissions?: Record<string, string>;
  repositoryId?: number;
  jwt?: string;
}): Promise<RepoTokenResult> {
  const { callerToken, installationId, owner, repo, permissions, jwt } = params;

  if (!owner) {
    throw new RepoTokenError("invalid_input", `"owner" is required.`);
  }
  if (!repo || repo.includes("/")) {
    throw new RepoTokenError(
      "invalid_input",
      `"repo" must be a bare repository name, not "owner/repo" (got "${repo}").`,
    );
  }

  // Cap permissions BEFORE any network call so an over-broad request is
  // rejected without touching GitHub.
  const cappedPermissions = capPermissions(permissions);

  // Security gate — mints nothing if the caller is not entitled. This resolves
  // the authoritative numeric repo id from the caller's own installation view.
  const resolvedRepositoryId = await authorizeAndResolveRepoId({
    callerToken,
    installationId,
    owner,
    repo,
  });

  // If the caller asserted a repositoryId, it must match what they are entitled
  // to. The resolved id stays authoritative (rename-proof) and is what we mint
  // and store.
  if (
    params.repositoryId !== undefined &&
    params.repositoryId !== resolvedRepositoryId
  ) {
    throw new RepoTokenError(
      "invalid_input",
      `Provided repositoryId ${params.repositoryId} does not match repository ` +
        `"${owner}/${repo}".`,
    );
  }

  let minted;
  try {
    minted = await mintInstallationAccessToken(
      installationId,
      { repository_ids: [resolvedRepositoryId], permissions: cappedPermissions },
      jwt ?? createAppJWT(),
    );
  } catch (err) {
    throw mapMintError(err);
  }

  return {
    token: minted.token,
    expiresAt: minted.expires_at,
    permissions: minted.permissions,
    repository: { owner, name: repo },
    installationId,
    repositoryId: resolvedRepositoryId,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
cd github && bun test server/lib/repo-token.test.ts
```
Expected: PASS (including the two new tests).

- [ ] **Step 5: Commit**

```bash
cd github && git add server/lib/repo-token.ts server/lib/repo-token.test.ts
git commit -m "feat(github): mintRepoScopedToken returns + cross-checks repositoryId"
```

---

## Task 5: `issueRepoGrant` — persist a grant from a mint result

**Files:**
- Create: `github/server/lib/repo-grant.ts`
- Test: `github/server/lib/repo-grant.test.ts`

- [ ] **Step 1: Write the failing test**

Create `github/server/lib/repo-grant.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd github && bun test server/lib/repo-grant.test.ts
```
Expected: FAIL — `Cannot find module './repo-grant.ts'`.

- [ ] **Step 3: Implement `issueRepoGrant`**

Create `github/server/lib/repo-grant.ts`:
```ts
/**
 * Synthetic repo-grant OAuth flow.
 *
 * - issueRepoGrant: persist a durable grant from a freshly minted token and
 *   return the opaque refresh token + endpoint metadata (used by MINT_REPO_TOKEN).
 * - mintRepoTokenWithGrant: the full MINT_REPO_TOKEN orchestration (Task 6).
 * - refreshRepoGrant / revokeRepoGrant + HTTP adapters (Tasks 7-8).
 *
 * Refresh redeems a grant using ONLY GitHub App credentials — no user-to-server
 * token. GitHub's own 422/404 means the grant is permanently invalid; outages
 * and our own misconfiguration are transient and must NOT invalidate the grant.
 */

import {
  DEFAULT_PUBLIC_BASE_URL,
  GRANT_TTL_SECONDS,
  REPO_GRANT_TOKEN_PATH,
} from "../constants.ts";
import {
  generateGrantCredentials,
  type RepoGrantMetadata,
  type RepoGrantStore,
} from "./repo-grant-store.ts";

void DEFAULT_PUBLIC_BASE_URL; // used by HTTP adapters in Task 8

export interface IssuedRepoGrant {
  refreshToken: string;
  tokenEndpoint: string;
  clientId: string;
  refreshTokenExpiresAt: string;
}

/** Create and persist a grant, returning the opaque refresh token + endpoint
 * metadata to embed in the MINT_REPO_TOKEN response. */
export async function issueRepoGrant(opts: {
  store: RepoGrantStore;
  installationId: number;
  repositoryId: number;
  owner: string;
  repo: string;
  permissions: Record<string, string>;
  clientId: string;
  baseUrl: string;
  createdByConnectionId?: string;
  now?: number;
}): Promise<IssuedRepoGrant> {
  const now = opts.now ?? Date.now();
  const { grantId, secretHash, refreshToken } = generateGrantCredentials();
  const expiresAt = new Date(now + GRANT_TTL_SECONDS * 1000).toISOString();

  const meta: RepoGrantMetadata = {
    grantId,
    secretHash,
    installationId: opts.installationId,
    repositoryId: opts.repositoryId,
    owner: opts.owner,
    repo: opts.repo,
    permissions: opts.permissions,
    createdAt: new Date(now).toISOString(),
    expiresAt,
    revokedAt: null,
    createdByConnectionId: opts.createdByConnectionId,
    clientId: opts.clientId,
  };
  await opts.store.create(meta);

  return {
    refreshToken,
    tokenEndpoint: `${opts.baseUrl}${REPO_GRANT_TOKEN_PATH}`,
    clientId: opts.clientId,
    refreshTokenExpiresAt: expiresAt,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
cd github && bun test server/lib/repo-grant.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd github && git add server/lib/repo-grant.ts server/lib/repo-grant.test.ts
git commit -m "feat(github): add issueRepoGrant to persist synthetic repo grants"
```

---

## Task 6: `mintRepoTokenWithGrant` — full MINT orchestration

**Files:**
- Modify: `github/server/lib/repo-grant.ts`
- Test: `github/server/lib/repo-grant.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `github/server/lib/repo-grant.test.ts`:
```ts
import { mintRepoTokenWithGrant } from "./repo-grant.ts";

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
        return json({ installations: [{ id: 42, account: { login: "acme" } }] });
      }
      if (/\/app\/installations\/42\/access_tokens/.test(url)) {
        return json(
          {
            token: "ghs_minted",
            expires_at: "2026-06-10T01:00:00.000Z",
            permissions: { contents: "write", metadata: "read", pull_requests: "write" },
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd github && bun test server/lib/repo-grant.test.ts
```
Expected: FAIL — `mintRepoTokenWithGrant` is not exported.

- [ ] **Step 3: Implement `mintRepoTokenWithGrant`**

In `github/server/lib/repo-grant.ts`, add the import of `mintRepoScopedToken` at the top (next to the existing imports):
```ts
import { mintRepoScopedToken } from "./repo-token.ts";
```

Then append:
```ts
export interface MintRepoTokenWithGrantResult {
  token: string;
  expiresAt: string;
  expiresIn: number;
  tokenType: "Bearer";
  permissions: Record<string, string>;
  repository: { id: number; owner: string; name: string };
  installationId: number;
  refreshToken: string;
  tokenEndpoint: string;
  clientId: string;
  refreshTokenExpiresAt: string;
}

/** Mint a short-lived repo-scoped token AND issue a durable refresh grant.
 * This is the orchestration behind the MINT_REPO_TOKEN tool. */
export async function mintRepoTokenWithGrant(opts: {
  callerToken: string;
  installationId: number;
  owner: string;
  repo: string;
  permissions?: Record<string, string>;
  repositoryId?: number;
  clientId: string;
  baseUrl: string;
  store: RepoGrantStore;
  createdByConnectionId?: string;
  jwt?: string;
  now?: number;
}): Promise<MintRepoTokenWithGrantResult> {
  const now = opts.now ?? Date.now();

  const minted = await mintRepoScopedToken({
    callerToken: opts.callerToken,
    installationId: opts.installationId,
    owner: opts.owner,
    repo: opts.repo,
    permissions: opts.permissions,
    repositoryId: opts.repositoryId,
    jwt: opts.jwt,
  });

  const issued = await issueRepoGrant({
    store: opts.store,
    installationId: minted.installationId,
    repositoryId: minted.repositoryId,
    owner: minted.repository.owner,
    repo: minted.repository.name,
    permissions: minted.permissions,
    clientId: opts.clientId,
    baseUrl: opts.baseUrl,
    createdByConnectionId: opts.createdByConnectionId,
    now,
  });

  const expiresIn = Math.max(
    0,
    Math.floor((Date.parse(minted.expiresAt) - now) / 1000),
  );

  return {
    token: minted.token,
    expiresAt: minted.expiresAt,
    expiresIn,
    tokenType: "Bearer",
    permissions: minted.permissions,
    repository: {
      id: minted.repositoryId,
      owner: minted.repository.owner,
      name: minted.repository.name,
    },
    installationId: minted.installationId,
    refreshToken: issued.refreshToken,
    tokenEndpoint: issued.tokenEndpoint,
    clientId: issued.clientId,
    refreshTokenExpiresAt: issued.refreshTokenExpiresAt,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
cd github && bun test server/lib/repo-grant.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd github && git add server/lib/repo-grant.ts server/lib/repo-grant.test.ts
git commit -m "feat(github): add mintRepoTokenWithGrant orchestration"
```

---

## Task 7: `refreshRepoGrant` — redeem a grant for a fresh token

**Files:**
- Modify: `github/server/lib/repo-grant.ts`
- Test: `github/server/lib/repo-grant.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `github/server/lib/repo-grant.test.ts`:
```ts
import { refreshRepoGrant } from "./repo-grant.ts";
import {
  generateGrantCredentials,
  type RepoGrantMetadata,
} from "./repo-grant-store.ts";

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
    expect(r).toMatchObject({ ok: false, status: 400, error: "invalid_request" });
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
    expect(r).toMatchObject({ ok: false, status: 400, error: "unsupported_grant_type" });
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
    expect(r).toMatchObject({ ok: false, status: 400, error: "invalid_client" });
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
    const { creds } = await seedGrant(store, { revokedAt: "2026-06-11T00:00:00.000Z" });
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
        expect(body.permissions).toEqual({ contents: "write", metadata: "read" });
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
    globalThis.fetch = realFetch;

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
    globalThis.fetch = realFetch;
    expect(r).toMatchObject({ ok: false, status: 400, error: "invalid_grant" });
    expect(kv.store.has(`grant:${meta.grantId}`)).toBe(false);
  });

  test("GitHub 404 (installation gone) → 400 invalid_grant", async () => {
    const store = getRepoGrantStore(fakeKV());
    const { creds } = await seedGrant(store);
    setFetch(async () => json({ message: "not found" }, 404));
    const r = await refreshRepoGrant({
      store,
      grantType: "refresh_token",
      refreshToken: creds.refreshToken,
      clientId: "Iv1.abc",
      expectedClientId: "Iv1.abc",
      jwt: "fake.jwt",
    });
    globalThis.fetch = realFetch;
    expect(r).toMatchObject({ ok: false, status: 400, error: "invalid_grant" });
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
    globalThis.fetch = realFetch;
    expect(r).toMatchObject({ ok: false, status: 503, error: "temporarily_unavailable" });
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
    globalThis.fetch = realFetch;
    expect(r).toMatchObject({ ok: false, status: 503, error: "temporarily_unavailable" });
    expect(kv.store.has(`grant:${meta.grantId}`)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
cd github && bun test server/lib/repo-grant.test.ts
```
Expected: FAIL — `refreshRepoGrant` is not exported.

- [ ] **Step 3: Implement `refreshRepoGrant`**

In `github/server/lib/repo-grant.ts`, add to the imports:
```ts
import {
  createAppJWT,
  GitHubAppApiError,
  mintInstallationAccessToken,
} from "./github-app-auth.ts";
```
and extend the existing `repo-grant-store.ts` import to also bring in `parseRefreshToken` and `verifySecret`:
```ts
import {
  generateGrantCredentials,
  parseRefreshToken,
  type RepoGrantMetadata,
  type RepoGrantStore,
  verifySecret,
} from "./repo-grant-store.ts";
```

Then append:
```ts
export type RefreshResult =
  | { ok: true; success: OAuthTokenSuccess; newExpiresAt: string }
  | { ok: false; status: number; error: string; error_description: string };

export interface OAuthTokenSuccess {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

const INVALID_GRANT_MESSAGE =
  "Repo grant is expired, revoked, unknown, or no longer valid.";

function oauthError(
  status: number,
  error: string,
  error_description: string,
): RefreshResult {
  return { ok: false, status, error, error_description };
}

/** Map a mint failure to a transient-vs-permanent OAuth error. Permanent
 * (422/404) means the grant can never work again; everything else (outage,
 * rate limit, our own bad App key → 401/403) is transient and must NOT cause
 * the mesh to discard a valid grant. */
function mapRefreshMintError(err: unknown): RefreshResult {
  if (err instanceof GitHubAppApiError) {
    if (err.status === 422 || err.status === 404) {
      return oauthError(400, "invalid_grant", INVALID_GRANT_MESSAGE);
    }
    return oauthError(
      503,
      "temporarily_unavailable",
      "Token service is temporarily unavailable. Please retry.",
    );
  }
  return oauthError(
    503,
    "temporarily_unavailable",
    "Token service is temporarily unavailable. Please retry.",
  );
}

/** Redeem a synthetic refresh token for a fresh repo-scoped installation token.
 * Uses ONLY GitHub App credentials — no user-to-server token. */
export async function refreshRepoGrant(opts: {
  store: RepoGrantStore;
  grantType: string | null;
  refreshToken: string | null;
  clientId: string | null;
  expectedClientId: string;
  now?: number;
  jwt?: string;
}): Promise<RefreshResult> {
  const now = opts.now ?? Date.now();

  // --- request validation (client errors; not grant invalidation) ---
  if (!opts.grantType || !opts.refreshToken) {
    return oauthError(
      400,
      "invalid_request",
      "Both grant_type and refresh_token are required.",
    );
  }
  if (opts.grantType !== "refresh_token") {
    return oauthError(
      400,
      "unsupported_grant_type",
      `grant_type "${opts.grantType}" is not supported; use refresh_token.`,
    );
  }
  if (
    opts.clientId &&
    opts.expectedClientId &&
    opts.clientId !== opts.expectedClientId
  ) {
    return oauthError(400, "invalid_client", "Unknown client_id.");
  }

  // --- grant lookup + constant-time secret verification (permanent) ---
  const parsed = parseRefreshToken(opts.refreshToken);
  if (!parsed) return oauthError(400, "invalid_grant", INVALID_GRANT_MESSAGE);

  let grant: RepoGrantMetadata | undefined;
  try {
    grant = await opts.store.get(parsed.grantId);
  } catch {
    return oauthError(
      503,
      "temporarily_unavailable",
      "Grant storage is temporarily unavailable. Please retry.",
    );
  }

  if (!grant || grant.revokedAt || !verifySecret(parsed.secret, grant.secretHash)) {
    return oauthError(400, "invalid_grant", INVALID_GRANT_MESSAGE);
  }
  if (grant.expiresAt && Date.parse(grant.expiresAt) <= now) {
    try {
      await opts.store.revoke(grant.grantId);
    } catch {
      // best-effort cleanup
    }
    return oauthError(400, "invalid_grant", INVALID_GRANT_MESSAGE);
  }

  // --- re-mint ---
  let jwt: string;
  try {
    jwt = opts.jwt ?? createAppJWT();
  } catch {
    // App credentials misconfigured: our fault, not the grant's. Transient.
    return oauthError(
      503,
      "temporarily_unavailable",
      "Token service is temporarily unavailable. Please retry.",
    );
  }

  let minted;
  try {
    minted = await mintInstallationAccessToken(
      grant.installationId,
      { repository_ids: [grant.repositoryId], permissions: grant.permissions },
      jwt,
    );
  } catch (err) {
    const mapped = mapRefreshMintError(err);
    // On a permanent (grant-invalidating) error, best-effort delete the grant.
    if (!mapped.ok && mapped.status === 400 && mapped.error === "invalid_grant") {
      try {
        await opts.store.revoke(grant.grantId);
      } catch {
        // best-effort
      }
    }
    return mapped;
  }

  // --- slide TTL and respond ---
  const newExpiresAt = new Date(now + GRANT_TTL_SECONDS * 1000).toISOString();
  try {
    await opts.store.touch(grant.grantId, newExpiresAt);
  } catch {
    // Non-fatal: the access token is already minted.
  }

  const expiresIn = Math.max(
    0,
    Math.floor((Date.parse(minted.expires_at) - now) / 1000),
  );

  return {
    ok: true,
    newExpiresAt,
    success: {
      access_token: minted.token,
      token_type: "Bearer",
      expires_in: expiresIn,
      refresh_token: opts.refreshToken,
      scope: `github-app-installation:${grant.installationId} repo:${grant.owner}/${grant.repo}`,
    },
  };
}
```

> Move the `OAuthTokenSuccess` interface above `RefreshResult` if your linter complains about use-before-define; both are type-only so ordering is cosmetic.

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
cd github && bun test server/lib/repo-grant.test.ts
```
Expected: PASS (all refresh branches).

- [ ] **Step 5: Commit**

```bash
cd github && git add server/lib/repo-grant.ts server/lib/repo-grant.test.ts
git commit -m "feat(github): add refreshRepoGrant with permanent/transient error mapping"
```

---

## Task 8: `revokeRepoGrant` + HTTP adapters

**Files:**
- Modify: `github/server/lib/repo-grant.ts`
- Test: `github/server/lib/repo-grant.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `github/server/lib/repo-grant.test.ts`:
```ts
import {
  handleRepoGrantRevokeRequest,
  handleRepoGrantTokenRequest,
  revokeRepoGrant,
} from "./repo-grant.ts";
import type { Env } from "../types/env.ts";

function formReq(path: string, params: Record<string, string>): Request {
  return new Request(`https://github-mcp.decocms.com${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
}

describe("revokeRepoGrant", () => {
  test("revokes a known grant and returns 200", async () => {
    const kv = fakeKV();
    const store = getRepoGrantStore(kv);
    const { creds, meta } = await seedGrant(store);
    const r = await revokeRepoGrant({ store, token: creds.refreshToken });
    expect(r.status).toBe(200);
    expect(kv.store.has(`grant:${meta.grantId}`)).toBe(false);
  });

  test("returns 200 for an unknown / malformed / missing token", async () => {
    const store = getRepoGrantStore(fakeKV());
    expect((await revokeRepoGrant({ store, token: null })).status).toBe(200);
    expect((await revokeRepoGrant({ store, token: "garbage" })).status).toBe(200);
  });
});

describe("HTTP adapters", () => {
  test("token endpoint: invalid_request body + 400 + no-store header", async () => {
    const env = { REPO_GRANTS: fakeKV() } as unknown as Env;
    const res = await handleRepoGrantTokenRequest(
      formReq("/repo-grant/token", { grant_type: "refresh_token" }),
      env,
    );
    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      error: "invalid_request",
      error_description: "Both grant_type and refresh_token are required.",
    });
  });

  test("token endpoint: full success path through the adapter", async () => {
    const kv = fakeKV();
    const store = getRepoGrantStore(kv);
    const { creds } = await seedGrant(store);
    const env = { REPO_GRANTS: kv, GITHUB_CLIENT_ID: "Iv1.abc" } as unknown as Env;

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
    const res = await handleRepoGrantTokenRequest(
      formReq("/repo-grant/token", {
        grant_type: "refresh_token",
        refresh_token: creds.refreshToken,
        client_id: "Iv1.abc",
      }),
      env,
      { jwt: "fake.jwt", now: Date.parse("2026-06-10T00:00:00.000Z") },
    );
    globalThis.fetch = realFetch;

    expect(res.status).toBe(200);
    const body = (await res.json()) as { access_token: string; token_type: string };
    expect(body.access_token).toBe("ghs_fresh");
    expect(body.token_type).toBe("Bearer");
  });

  test("revoke endpoint: always 200", async () => {
    const env = { REPO_GRANTS: fakeKV() } as unknown as Env;
    const res = await handleRepoGrantRevokeRequest(
      formReq("/repo-grant/revoke", { token: "garbage" }),
      env,
    );
    expect(res.status).toBe(200);
  });
});
```

> Note: this test reads `process.env.GITHUB_CLIENT_ID` indirectly — the adapter prefers `env.GITHUB_CLIENT_ID` if set (see implementation), so no global env mutation is needed.

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
cd github && bun test server/lib/repo-grant.test.ts
```
Expected: FAIL — `revokeRepoGrant` / `handleRepoGrantTokenRequest` / `handleRepoGrantRevokeRequest` not exported.

- [ ] **Step 3: Implement revoke + adapters**

In `github/server/lib/repo-grant.ts`, add to the top imports:
```ts
import { getRepoGrantStore } from "./repo-grant-store.ts";
import type { Env } from "../types/env.ts";
```
(extend the existing `repo-grant-store.ts` import rather than duplicating — add `getRepoGrantStore` to it; keep `Env` as a separate `import type` line). Remove the now-unneeded `void DEFAULT_PUBLIC_BASE_URL;` scaffolding line from Task 5.

Then append:
```ts
/** RFC 7009-style revoke. Always 200 (even for unknown/malformed tokens) to
 * avoid leaking token validity; only storage failure surfaces as 503. */
export async function revokeRepoGrant(opts: {
  store: RepoGrantStore;
  token: string | null;
}): Promise<{ status: number; body?: { error: string } }> {
  if (!opts.token) return { status: 200 };
  const parsed = parseRefreshToken(opts.token);
  if (!parsed) return { status: 200 };
  try {
    await opts.store.revoke(parsed.grantId);
  } catch {
    return { status: 503, body: { error: "temporarily_unavailable" } };
  }
  return { status: 200 };
}

const NO_STORE: Record<string, string> = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
};
const JSON_NO_STORE: Record<string, string> = {
  ...NO_STORE,
  "Content-Type": "application/json",
};

async function readForm(req: Request): Promise<URLSearchParams> {
  return new URLSearchParams(await req.text());
}

function clientIdOf(env: Env): string {
  return env.GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID || "";
}

function baseUrlOf(env: Env): string {
  return env.PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE_URL;
}

/** Re-export so MINT_REPO_TOKEN can resolve the public base URL the same way. */
export { baseUrlOf as repoGrantBaseUrl, clientIdOf as repoGrantClientId };

/** POST /repo-grant/token — OAuth refresh_token grant. */
export async function handleRepoGrantTokenRequest(
  req: Request,
  env: Env,
  deps: { jwt?: string; now?: number } = {},
): Promise<Response> {
  const form = await readForm(req);
  const result = await refreshRepoGrant({
    store: getRepoGrantStore(env.REPO_GRANTS),
    grantType: form.get("grant_type"),
    refreshToken: form.get("refresh_token"),
    clientId: form.get("client_id"),
    expectedClientId: clientIdOf(env),
    jwt: deps.jwt,
    now: deps.now,
  });

  if (result.ok) {
    return new Response(JSON.stringify(result.success), {
      status: 200,
      headers: JSON_NO_STORE,
    });
  }
  return new Response(
    JSON.stringify({ error: result.error, error_description: result.error_description }),
    { status: result.status, headers: JSON_NO_STORE },
  );
}

/** POST /repo-grant/revoke — RFC 7009 token revocation. */
export async function handleRepoGrantRevokeRequest(
  req: Request,
  env: Env,
): Promise<Response> {
  const form = await readForm(req);
  const result = await revokeRepoGrant({
    store: getRepoGrantStore(env.REPO_GRANTS),
    token: form.get("token"),
  });
  return new Response(result.body ? JSON.stringify(result.body) : null, {
    status: result.status,
    headers: result.body ? JSON_NO_STORE : NO_STORE,
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
cd github && bun test server/lib/repo-grant.test.ts
```
Expected: PASS (revoke + adapter blocks).

- [ ] **Step 5: Typecheck the whole package**

Run:
```bash
cd github && bun run check
```
Expected: PASS. Fix any type errors (e.g. unused imports) before committing.

- [ ] **Step 6: Commit**

```bash
cd github && git add server/lib/repo-grant.ts server/lib/repo-grant.test.ts
git commit -m "feat(github): add repo-grant revoke + OAuth HTTP adapters"
```

---

## Task 9: Wire the new behavior into the `MINT_REPO_TOKEN` tool

**Files:**
- Modify: `github/server/tools/mint-repo-token.ts`

- [ ] **Step 1: Extend the tool's input/output schema + execute**

Replace the entire contents of `github/server/tools/mint-repo-token.ts` with:
```ts
/**
 * MINT_REPO_TOKEN — mint a GitHub App installation access token scoped to
 * exactly one repository, AND issue a durable synthetic refresh token (an
 * MCP-issued repo grant — NOT a GitHub refresh token).
 *
 * The short-lived (~1h) `ghs_` token is unchanged. The refresh token is the
 * opaque `ghr_<grantId>.<secret>` string; redeeming it at `tokenEndpoint`
 * re-mints a fresh `ghs_` token using only the GitHub App credentials.
 *
 * `createPrivateTool` ensures the caller is authenticated; caller authorization,
 * permission capping, minting and grant issuance live in ../lib/*.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import {
  mintRepoTokenWithGrant,
  repoGrantBaseUrl,
  repoGrantClientId,
} from "../lib/repo-grant.ts";
import { getRepoGrantStore } from "../lib/repo-grant-store.ts";
import type { Env } from "../types/env.ts";

export function createMintRepoTokenTool() {
  return createPrivateTool({
    id: "MINT_REPO_TOKEN",
    description:
      "Mint a short-lived (~1h) GitHub token scoped to exactly ONE repository " +
      "with least-privilege permissions, using the GitHub App. The authenticated " +
      "caller must already be entitled to the installation and repository — the " +
      "tool verifies this against the caller's own GitHub context before minting. " +
      "The token grants only repo-content / pull-request / issue access. Also " +
      "returns a durable refresh token (refreshToken) plus tokenEndpoint and " +
      "clientId: POST grant_type=refresh_token to tokenEndpoint to mint a fresh " +
      "token later without the caller's GitHub login.",
    inputSchema: z.object({
      installationId: z
        .number()
        .int()
        .describe("GitHub App installation id to mint the token under."),
      owner: z
        .string()
        .describe('The installation account login, e.g. "acme" (NOT "owner/repo").'),
      repo: z
        .string()
        .describe('The repository NAME only, e.g. "web" (NOT "acme/web").'),
      repositoryId: z
        .number()
        .int()
        .optional()
        .describe(
          "Optional numeric repository id. When provided it is cross-checked " +
            "against the repo the caller is entitled to; the resolved id is " +
            "authoritative (rename-proof).",
        ),
      permissions: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          "Optional GitHub permission map, capped to least privilege. Allowed " +
            "keys: contents, metadata, pull_requests, issues; values: read | " +
            'write. Defaults to { contents: "write", metadata: "read", ' +
            'pull_requests: "write" }. Anything broader is rejected.',
        ),
    }),
    outputSchema: z.object({
      token: z.string().describe("The ghs_ repository-scoped installation token."),
      expiresAt: z.string().describe("ISO8601 expiry (~1h from now; issued by GitHub)."),
      expiresIn: z
        .number()
        .optional()
        .describe("Seconds until the access token expires (usually <= 3600)."),
      tokenType: z.literal("Bearer").optional(),
      permissions: z
        .record(z.string(), z.string())
        .describe("The permissions actually granted, echoed from GitHub."),
      repository: z.object({
        id: z.number().optional(),
        owner: z.string(),
        name: z.string(),
      }),
      installationId: z.number(),
      refreshToken: z
        .string()
        .describe("Opaque MCP-issued repo grant (ghr_...). NOT a GitHub token."),
      tokenEndpoint: z
        .string()
        .describe("Absolute HTTPS endpoint accepting a refresh_token grant."),
      clientId: z.string().describe("Stable client id expected by tokenEndpoint."),
      refreshTokenExpiresAt: z
        .string()
        .nullable()
        .optional()
        .describe("ISO8601 expiry of the refresh grant (sliding 90 days)."),
    }),
    execute: async ({ context, runtimeContext }) => {
      const env = runtimeContext.env as unknown as Env;
      const callerToken = env.MESH_REQUEST_CONTEXT?.authorization ?? "";

      return await mintRepoTokenWithGrant({
        callerToken,
        installationId: context.installationId,
        owner: context.owner,
        repo: context.repo,
        repositoryId: context.repositoryId,
        permissions: context.permissions,
        clientId: repoGrantClientId(env),
        baseUrl: repoGrantBaseUrl(env),
        store: getRepoGrantStore(),
        createdByConnectionId: env.MESH_REQUEST_CONTEXT?.connectionId,
      });
    },
  });
}
```

> `getRepoGrantStore()` (no arg) uses the per-request KV singleton set by `setRepoGrantKV` in `main.ts` (Task 10), mirroring how triggers read `INSTALLATIONS`.

- [ ] **Step 2: Typecheck**

Run:
```bash
cd github && bun run check
```
Expected: PASS. (If `env.MESH_REQUEST_CONTEXT.connectionId` is typed as possibly-undefined, that's fine — `createdByConnectionId` is optional.)

- [ ] **Step 3: Run the full lib test suite (no regressions)**

Run:
```bash
cd github && bun test
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd github && git add server/tools/mint-repo-token.ts
git commit -m "feat(github): MINT_REPO_TOKEN issues a synthetic refresh grant"
```

---

## Task 10: Route the endpoints + provision the KV namespace

**Files:**
- Modify: `github/server/main.ts:155-189`
- Modify: `github/wrangler.toml`

- [ ] **Step 1: Add KV namespace + threading + routing in main.ts**

In `github/server/main.ts`, add imports near the other `./lib/*` imports:
```ts
import {
  handleRepoGrantRevokeRequest,
  handleRepoGrantTokenRequest,
} from "./lib/repo-grant.ts";
import { setRepoGrantKV } from "./lib/repo-grant-store.ts";
import { REPO_GRANT_REVOKE_PATH, REPO_GRANT_TOKEN_PATH } from "./constants.ts";
```

In the `handle()` function, right after the existing `setTriggerKV(env.INSTALLATIONS);` line, add:
```ts
  // Make the REPO_GRANTS KV binding visible to the grant store's module-level
  // singleton for this request (used by the MINT_REPO_TOKEN tool).
  setRepoGrantKV(env.REPO_GRANTS);
```

Then, immediately after the webhook block (after the `if (req.method === "POST" && url.pathname === "/webhooks/github") { ... }` block) and BEFORE the `/mcp` proxy block, add:
```ts
  // Synthetic repo-grant OAuth endpoints (unauthenticated — the opaque refresh
  // token is the credential). Namespaced under /repo-grant/* to stay clear of
  // the runtime's /oauth/* routes.
  if (req.method === "POST" && url.pathname === REPO_GRANT_TOKEN_PATH) {
    return handleRepoGrantTokenRequest(req, env);
  }
  if (req.method === "POST" && url.pathname === REPO_GRANT_REVOKE_PATH) {
    return handleRepoGrantRevokeRequest(req, env);
  }
```

- [ ] **Step 2: Add the KV namespace to wrangler.toml**

Append to `github/wrangler.toml`:
```toml
# Durable storage for synthetic repo-grant refresh tokens (prefix `grant:`).
# Each grant stores hashed-at-rest metadata with a sliding 90-day TTL.
#
# Create with: bunx wrangler kv namespace create REPO_GRANTS
# Then replace the id below with the returned id BEFORE deploying.
[[kv_namespaces]]
binding = "REPO_GRANTS"
id = "REPLACE_WITH_REPO_GRANTS_KV_ID"
```

> ⚠️ Manual deploy step: the `id` is a placeholder. Before `bun run deploy`, run
> `cd github && bunx wrangler kv namespace create REPO_GRANTS` and paste the
> returned id. The local build/dry-run does not contact the real namespace.

- [ ] **Step 3: Typecheck + build (dry-run)**

Run:
```bash
cd github && bun run check && bun run build
```
Expected: `check` PASS; `build` (`wrangler deploy --dry-run --outdir=dist`) completes without bundling errors. (The placeholder KV id does not block a dry-run build.)

- [ ] **Step 4: Run the full test suite**

Run:
```bash
cd github && bun test
```
Expected: PASS (all suites).

- [ ] **Step 5: Commit**

```bash
cd github && git add server/main.ts wrangler.toml
git commit -m "feat(github): route /repo-grant/{token,revoke} + REPO_GRANTS KV"
```

---

## Final verification

- [ ] **Step 1: Full suite + typecheck + build**

Run:
```bash
cd github && bun test && bun run check && bun run build
```
Expected: tests PASS, typecheck PASS, build completes.

- [ ] **Step 2: Confirm acceptance criteria against the spec**

Verify each spec acceptance criterion maps to passing behavior:
- `MINT_REPO_TOKEN` still returns `token`/`expiresAt` (Task 9 output schema; Task 6 test).
- `MINT_REPO_TOKEN` returns `refreshToken`/`tokenEndpoint`/`clientId` (Task 6 test).
- `POST /repo-grant/token` returns a fresh `ghs_` scoped to the same install/repo/perms (Task 7 success test asserts `repository_ids:[999]` + stored permissions).
- No user token used at refresh (Task 7 mints with `jwt` only; no `/user/installations` call).
- Invalid/revoked → `400 invalid_grant`; transient never `invalid_grant` (Task 7 tests).
- Backward compatibility (Task 4 updated assertion + Task 9 additive schema).
- `POST /repo-grant/revoke` invalidates a grant (Task 8 test).

- [ ] **Step 3: Note remaining manual step**

Surface to the user: the `REPO_GRANTS` KV namespace id in `wrangler.toml` is a placeholder and must be created + pasted before production deploy.

---

## Self-Review (completed by plan author)

**Spec coverage:** Every spec section maps to a task — storage/dedicated KV (T1, T3, T10), token shape + hashing (T2), `repositoryId` input + cross-check (T4), grant issuance + new output fields (T5, T6, T9), refresh endpoint semantics incl. permanent/transient table (T7), revoke + HTTP adapters (T8), routing + public URL + clientId (T8, T9, T10). Stable refresh token: T7 returns `opts.refreshToken` unchanged. Sliding 90d TTL: T3 `expirationTtl` + T7 `touch`. Out-of-scope items are not implemented.

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to". The only literal placeholder is the `REPO_GRANTS` KV `id` in wrangler.toml, which is intentional (created at deploy) and flagged as a manual step.

**Type consistency:** `RepoGrantMetadata`, `RepoGrantStore`, `getRepoGrantStore`, `setRepoGrantKV`, `generateGrantCredentials`, `parseRefreshToken`, `verifySecret`, `issueRepoGrant`, `mintRepoTokenWithGrant`, `refreshRepoGrant`, `revokeRepoGrant`, `handleRepoGrantTokenRequest`, `handleRepoGrantRevokeRequest`, `repoGrantBaseUrl`, `repoGrantClientId` are defined once and referenced consistently across tasks. `mintRepoScopedToken` gains `repositoryId` in both its result and params (T4) and is consumed accordingly (T6). Constant names (`REPO_GRANT_TOKEN_PATH`, `REPO_GRANT_REVOKE_PATH`, `GRANT_TTL_SECONDS`, `GRANT_KEY_PREFIX`, `REFRESH_TOKEN_PREFIX`, `DEFAULT_PUBLIC_BASE_URL`) match between definition (T1) and use.
