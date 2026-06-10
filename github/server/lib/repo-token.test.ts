import { afterEach, describe, expect, test } from "bun:test";
import { GitHubAppApiError } from "./github-app-auth.ts";
import {
  authorizeAndResolveRepoId,
  capPermissions,
  DEFAULT_PERMISSIONS,
  mapMintError,
  mintRepoScopedToken,
  RepoTokenError,
} from "./repo-token.ts";

const realFetch = globalThis.fetch;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

type AnyFetch = (input: unknown, init?: unknown) => Promise<Response>;
function setFetch(impl: AnyFetch) {
  globalThis.fetch = impl as unknown as typeof globalThis.fetch;
}
function urlOf(input: unknown): string {
  return typeof input === "string" ? input : (input as { url: string }).url;
}

async function expectRejectCode(
  fn: () => Promise<unknown>,
  code: RepoTokenError["code"],
): Promise<RepoTokenError> {
  let caught: unknown;
  try {
    await fn();
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(RepoTokenError);
  expect((caught as RepoTokenError).code).toBe(code);
  return caught as RepoTokenError;
}

// ============================================================================
// capPermissions — least-privilege capping
// ============================================================================

describe("capPermissions", () => {
  test("returns the default coding-agent permissions when none provided", () => {
    expect(capPermissions(undefined)).toEqual(DEFAULT_PERMISSIONS);
    expect(capPermissions({})).toEqual(DEFAULT_PERMISSIONS);
  });

  test("passes through an allowed subset and always includes metadata:read", () => {
    expect(capPermissions({ contents: "read" })).toEqual({
      contents: "read",
      metadata: "read",
    });
    expect(capPermissions({ issues: "write" })).toEqual({
      issues: "write",
      metadata: "read",
    });
  });

  test("forces metadata to read even if write is requested", () => {
    expect(capPermissions({ metadata: "write" })).toEqual({ metadata: "read" });
  });

  test.each([
    "administration",
    "members",
    "organization_administration",
    "secrets",
    "actions",
    "environments",
    "deployments",
  ])("hard-rejects the disallowed permission %s", (perm) => {
    let caught: unknown;
    try {
      capPermissions({ [perm]: "read" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(RepoTokenError);
    expect((caught as RepoTokenError).code).toBe("permission_denied");
  });

  test("rejects the admin permission level even for an allowed key", () => {
    let caught: unknown;
    try {
      capPermissions({ contents: "admin" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(RepoTokenError);
    expect((caught as RepoTokenError).code).toBe("permission_denied");
  });
});

// ============================================================================
// authorizeAndResolveRepoId — the security gate + rename-proof id resolution
// ============================================================================

describe("authorizeAndResolveRepoId", () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function mockGitHub(opts: {
    installations?: Array<{ id: number; account: { login: string } }> | "401";
    repositories?: Record<
      number,
      Array<{ id: number; name: string; owner: { login: string } }>
    >;
  }) {
    setFetch(async (input) => {
      const url = urlOf(input);
      const repoMatch = url.match(/\/user\/installations\/(\d+)\/repositories/);
      if (repoMatch) {
        const id = Number(repoMatch[1]);
        const repos = (opts.repositories ?? {})[id] ?? [];
        return json({ total_count: repos.length, repositories: repos });
      }
      if (url.includes("/user/installations")) {
        if (opts.installations === "401") {
          return new Response("bad credentials", { status: 401 });
        }
        const insts = opts.installations ?? [];
        return json({ total_count: insts.length, installations: insts });
      }
      throw new Error(`unexpected url ${url}`);
    });
  }

  test("returns the repo id when the caller is entitled to installation + repo", async () => {
    mockGitHub({
      installations: [{ id: 42, account: { login: "acme" } }],
      repositories: {
        42: [{ id: 999, name: "web", owner: { login: "acme" } }],
      },
    });
    const id = await authorizeAndResolveRepoId({
      callerToken: "ghu_x",
      installationId: 42,
      owner: "acme",
      repo: "web",
    });
    expect(id).toBe(999);
  });

  test("throws unauthorized_caller when the installation is not in the caller's list", async () => {
    mockGitHub({
      installations: [{ id: 1, account: { login: "acme" } }],
      repositories: {},
    });
    await expectRejectCode(
      () =>
        authorizeAndResolveRepoId({
          callerToken: "ghu_x",
          installationId: 42,
          owner: "acme",
          repo: "web",
        }),
      "unauthorized_caller",
    );
  });

  test("throws unauthorized_caller when the installation belongs to a different owner", async () => {
    mockGitHub({
      installations: [{ id: 42, account: { login: "evil" } }],
      repositories: { 42: [{ id: 5, name: "web", owner: { login: "evil" } }] },
    });
    await expectRejectCode(
      () =>
        authorizeAndResolveRepoId({
          callerToken: "ghu_x",
          installationId: 42,
          owner: "acme",
          repo: "web",
        }),
      "unauthorized_caller",
    );
  });

  test("throws repo_not_accessible when the repo is not in the installation", async () => {
    mockGitHub({
      installations: [{ id: 42, account: { login: "acme" } }],
      repositories: {
        42: [{ id: 1, name: "other", owner: { login: "acme" } }],
      },
    });
    await expectRejectCode(
      () =>
        authorizeAndResolveRepoId({
          callerToken: "ghu_x",
          installationId: 42,
          owner: "acme",
          repo: "web",
        }),
      "repo_not_accessible",
    );
  });

  test("matches owner and repo case-insensitively", async () => {
    mockGitHub({
      installations: [{ id: 42, account: { login: "Acme" } }],
      repositories: { 42: [{ id: 7, name: "Web", owner: { login: "Acme" } }] },
    });
    const id = await authorizeAndResolveRepoId({
      callerToken: "ghu_x",
      installationId: 42,
      owner: "acme",
      repo: "web",
    });
    expect(id).toBe(7);
  });

  test("throws unauthorized_caller when the caller token is rejected (401)", async () => {
    mockGitHub({ installations: "401" });
    await expectRejectCode(
      () =>
        authorizeAndResolveRepoId({
          callerToken: "bad",
          installationId: 42,
          owner: "acme",
          repo: "web",
        }),
      "unauthorized_caller",
    );
  });

  test("throws unauthorized_caller when no caller token is supplied", async () => {
    let called = false;
    setFetch(async () => {
      called = true;
      return json({ installations: [] });
    });
    await expectRejectCode(
      () =>
        authorizeAndResolveRepoId({
          callerToken: "",
          installationId: 42,
          owner: "acme",
          repo: "web",
        }),
      "unauthorized_caller",
    );
    expect(called).toBe(false);
  });

  test("resolves a repo id found on a later page", async () => {
    setFetch(async (input) => {
      const url = urlOf(input);
      if (/\/user\/installations\/42\/repositories/.test(url)) {
        const page = Number(new URL(url).searchParams.get("page"));
        if (page === 1) {
          const repos = Array.from({ length: 100 }, (_, i) => ({
            id: i + 1,
            name: `r${i}`,
            owner: { login: "acme" },
          }));
          return json({ total_count: 101, repositories: repos });
        }
        return json({
          total_count: 101,
          repositories: [{ id: 5000, name: "web", owner: { login: "acme" } }],
        });
      }
      if (url.includes("/user/installations")) {
        return json({
          total_count: 1,
          installations: [{ id: 42, account: { login: "acme" } }],
        });
      }
      throw new Error(`unexpected url ${url}`);
    });
    const id = await authorizeAndResolveRepoId({
      callerToken: "ghu_x",
      installationId: 42,
      owner: "acme",
      repo: "web",
    });
    expect(id).toBe(5000);
  });

  test("classifies a 5xx on /user/installations as transient upstream_error, not a denial", async () => {
    setFetch(async (input) => {
      const url = urlOf(input);
      if (url.includes("/user/installations")) {
        return new Response("upstream down", { status: 503 });
      }
      throw new Error(`unexpected url ${url}`);
    });
    await expectRejectCode(
      () =>
        authorizeAndResolveRepoId({
          callerToken: "ghu_x",
          installationId: 42,
          owner: "acme",
          repo: "web",
        }),
      "upstream_error",
    );
  });

  test("classifies a 403 secondary-rate-limit on the gate as upstream_error, not a denial", async () => {
    setFetch(async (input) => {
      const url = urlOf(input);
      if (url.includes("/user/installations")) {
        return new Response("rate limited", {
          status: 403,
          headers: { "x-ratelimit-remaining": "0", "retry-after": "60" },
        });
      }
      throw new Error(`unexpected url ${url}`);
    });
    await expectRejectCode(
      () =>
        authorizeAndResolveRepoId({
          callerToken: "ghu_x",
          installationId: 42,
          owner: "acme",
          repo: "web",
        }),
      "upstream_error",
    );
  });

  test("classifies a 5xx on the repositories endpoint as transient upstream_error", async () => {
    setFetch(async (input) => {
      const url = urlOf(input);
      if (/\/user\/installations\/42\/repositories/.test(url)) {
        return new Response("bad gateway", { status: 502 });
      }
      if (url.includes("/user/installations")) {
        return json({
          total_count: 1,
          installations: [{ id: 42, account: { login: "acme" } }],
        });
      }
      throw new Error(`unexpected url ${url}`);
    });
    await expectRejectCode(
      () =>
        authorizeAndResolveRepoId({
          callerToken: "ghu_x",
          installationId: 42,
          owner: "acme",
          repo: "web",
        }),
      "upstream_error",
    );
  });
});

// ============================================================================
// mapMintError — GitHub mint-endpoint status → clear, leak-free error
// ============================================================================

describe("mapMintError", () => {
  test("maps 422 to repo_not_accessible", () => {
    expect(mapMintError(new GitHubAppApiError(422, "x")).code).toBe(
      "repo_not_accessible",
    );
  });

  test("maps 404 to installation_not_found", () => {
    expect(mapMintError(new GitHubAppApiError(404, "x")).code).toBe(
      "installation_not_found",
    );
  });

  test("maps 401 to config_error without leaking the upstream detail", () => {
    const mapped = mapMintError(new GitHubAppApiError(401, "private key bad"));
    expect(mapped.code).toBe("config_error");
    expect(mapped.message).not.toContain("private key");
  });

  test("maps 403 to config_error", () => {
    expect(mapMintError(new GitHubAppApiError(403, "x")).code).toBe(
      "config_error",
    );
  });

  test("maps 5xx to a transient upstream_error (not a config error)", () => {
    expect(mapMintError(new GitHubAppApiError(503, "x")).code).toBe(
      "upstream_error",
    );
  });

  test("maps 429 (rate limited) to upstream_error", () => {
    expect(mapMintError(new GitHubAppApiError(429, "x")).code).toBe(
      "upstream_error",
    );
  });

  test("passes a RepoTokenError through unchanged", () => {
    const orig = new RepoTokenError("unauthorized_caller", "m");
    expect(mapMintError(orig)).toBe(orig);
  });
});

// ============================================================================
// mintRepoScopedToken — full orchestration
// ============================================================================

describe("mintRepoScopedToken", () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("mints a repo-scoped token end to end with the expected output shape", async () => {
    setFetch(async (input, init) => {
      const url = urlOf(input);
      if (/\/user\/installations\/42\/repositories/.test(url)) {
        return json({
          total_count: 1,
          repositories: [{ id: 999, name: "web", owner: { login: "acme" } }],
        });
      }
      if (url.includes("/user/installations")) {
        return json({
          total_count: 1,
          installations: [{ id: 42, account: { login: "acme" } }],
        });
      }
      if (/\/app\/installations\/42\/access_tokens/.test(url)) {
        const reqInit = init as { method?: string; body?: string };
        expect(reqInit.method).toBe("POST");
        const body = JSON.parse(reqInit.body ?? "{}");
        expect(body.repository_ids).toEqual([999]);
        expect(body.permissions).toEqual({
          contents: "write",
          metadata: "read",
          pull_requests: "write",
        });
        return json(
          {
            token: "ghs_minted",
            expires_at: "2026-06-05T12:00:00Z",
            permissions: body.permissions,
            repositories: [{ id: 999, name: "web", full_name: "acme/web" }],
          },
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
      jwt: "fake.jwt",
    });

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
  });

  test("rejects owner/repo passed together in the repo field", async () => {
    await expectRejectCode(
      () =>
        mintRepoScopedToken({
          callerToken: "ghu_x",
          installationId: 42,
          owner: "acme",
          repo: "acme/web",
          jwt: "fake.jwt",
        }),
      "invalid_input",
    );
  });

  test("maps a 422 from the mint endpoint to repo_not_accessible", async () => {
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
      if (/access_tokens/.test(url)) {
        return json({ message: "one repository does not exist" }, 422);
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
          jwt: "fake.jwt",
        }),
      "repo_not_accessible",
    );
  });

  test("mints NOTHING when the caller is not authorized", async () => {
    let mintCalled = false;
    setFetch(async (input) => {
      const url = urlOf(input);
      if (/access_tokens/.test(url)) {
        mintCalled = true;
        return json({ token: "ghs_should_not_happen" }, 201);
      }
      if (url.includes("/user/installations")) {
        return json({ installations: [] });
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
          jwt: "fake.jwt",
        }),
      "unauthorized_caller",
    );
    expect(mintCalled).toBe(false);
  });

  test("accepts a matching repositoryId and mints with it", async () => {
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
      if (/access_tokens/.test(url)) {
        return json(
          {
            token: "ghs_ok",
            expires_at: "2026-06-05T12:00:00Z",
            permissions: {},
          },
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
        return json({
          installations: [{ id: 42, account: { login: "acme" } }],
        });
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
});
