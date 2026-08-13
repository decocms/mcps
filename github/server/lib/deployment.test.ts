import { afterEach, describe, expect, test } from "bun:test";
import { DeploymentError, getPreviewDeployment } from "./deployment.ts";

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

afterEach(() => {
  globalThis.fetch = realFetch;
});

async function expectRejectCode(
  fn: () => Promise<unknown>,
  code: DeploymentError["code"],
): Promise<DeploymentError> {
  let caught: unknown;
  try {
    await fn();
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(DeploymentError);
  expect((caught as DeploymentError).code).toBe(code);
  return caught as DeploymentError;
}

const SHA = "f9f522ce9642cf7f2024e45b9ddc618a6f78bf8c";

describe("getPreviewDeployment", () => {
  test("returns the environment_url from the newest successful status", async () => {
    const calls: string[] = [];
    setFetch(async (input, init) => {
      const url = urlOf(input);
      calls.push(url);
      const headers = (init as { headers: Record<string, string> }).headers;
      expect(headers.Authorization).toBe("Bearer ghs_tok");
      if (url.includes("/deployments?")) {
        expect(url).toBe(
          `https://api.github.com/repos/acme/store/deployments?sha=${SHA}&per_page=10`,
        );
        return json([{ id: 42, environment: "staging" }]);
      }
      expect(url).toBe(
        "https://api.github.com/repos/acme/store/deployments/42/statuses?per_page=30",
      );
      return json([
        {
          state: "success",
          environment_url: "https://x--store.preview.vtex.app",
        },
        { state: "in_progress", environment_url: null },
      ]);
    });

    const r = await getPreviewDeployment({
      token: "ghs_tok",
      owner: "acme",
      repo: "store",
      sha: SHA,
    });

    expect(r).toEqual({
      environmentUrl: "https://x--store.preview.vtex.app",
      environment: "staging",
      state: "success",
      deploymentId: 42,
    });
    expect(calls.length).toBe(2);
  });

  test("skips deployments with no successful url and scans the next one", async () => {
    setFetch(async (input) => {
      const url = urlOf(input);
      if (url.includes("/deployments?")) {
        return json([
          { id: 1, environment: "production" },
          { id: 2, environment: "staging" },
        ]);
      }
      if (url.includes("/deployments/1/statuses")) {
        return json([{ state: "failure", environment_url: null }]);
      }
      return json([
        { state: "success", environment_url: "https://prev.preview.vtex.app" },
      ]);
    });

    const r = await getPreviewDeployment({
      token: "t",
      owner: "a",
      repo: "b",
      sha: SHA,
    });
    expect(r.environmentUrl).toBe("https://prev.preview.vtex.app");
    expect(r.deploymentId).toBe(2);
    expect(r.environment).toBe("staging");
  });

  test("no deployments for the sha → empty (not an error)", async () => {
    setFetch(async () => json([]));
    const r = await getPreviewDeployment({
      token: "t",
      owner: "a",
      repo: "b",
      sha: SHA,
    });
    expect(r).toEqual({
      environmentUrl: null,
      environment: null,
      state: null,
      deploymentId: null,
    });
  });

  test("deployment exists but no success status yet → empty (in-flight)", async () => {
    setFetch(async (input) => {
      const url = urlOf(input);
      if (url.includes("/deployments?")) {
        return json([{ id: 7, environment: "staging" }]);
      }
      return json([{ state: "in_progress", environment_url: null }]);
    });
    const r = await getPreviewDeployment({
      token: "t",
      owner: "a",
      repo: "b",
      sha: SHA,
    });
    expect(r.environmentUrl).toBeNull();
  });

  test("passes the environment filter through to the deployments query", async () => {
    setFetch(async (input) => {
      const url = urlOf(input);
      if (url.includes("/deployments?")) {
        expect(url).toContain("&environment=staging");
        return json([]);
      }
      return json([]);
    });
    await getPreviewDeployment({
      token: "t",
      owner: "a",
      repo: "b",
      sha: SHA,
      environment: "staging",
    });
  });

  test("percent-encodes owner/repo path segments", async () => {
    setFetch(async (input) => {
      const url = urlOf(input);
      expect(url).toContain("/repos/deco-cx/my.repo/deployments");
      return json([]);
    });
    await getPreviewDeployment({
      token: "t",
      owner: "deco-cx",
      repo: "my.repo",
      sha: SHA,
    });
  });

  test("rejects owner/repo/sha with path-injection characters before fetching", async () => {
    setFetch(async () => {
      throw new Error("should not fetch");
    });
    for (const bad of ["..", "a/b", "x?y", "../../user"]) {
      await expectRejectCode(
        () =>
          getPreviewDeployment({ token: "t", owner: bad, repo: "b", sha: SHA }),
        "invalid_input",
      );
      await expectRejectCode(
        () =>
          getPreviewDeployment({ token: "t", owner: "a", repo: bad, sha: SHA }),
        "invalid_input",
      );
    }
    for (const badSha of ["", "nothex", "g".repeat(40), "abc/../def"]) {
      await expectRejectCode(
        () =>
          getPreviewDeployment({
            token: "t",
            owner: "a",
            repo: "b",
            sha: badSha,
          }),
        "invalid_input",
      );
    }
  });

  test("missing token → unauthorized without a network call", async () => {
    setFetch(async () => {
      throw new Error("should not fetch");
    });
    await expectRejectCode(
      () =>
        getPreviewDeployment({ token: "", owner: "a", repo: "b", sha: SHA }),
      "unauthorized",
    );
  });

  test("403 → unauthorized (token may lack deployments:read)", async () => {
    setFetch(async () => json({ message: "Resource not accessible" }, 403));
    await expectRejectCode(
      () =>
        getPreviewDeployment({ token: "t", owner: "a", repo: "b", sha: SHA }),
      "unauthorized",
    );
  });

  test("404 → not_found", async () => {
    setFetch(async () => json({ message: "Not Found" }, 404));
    await expectRejectCode(
      () =>
        getPreviewDeployment({ token: "t", owner: "a", repo: "b", sha: SHA }),
      "not_found",
    );
  });

  test("5xx → upstream_error", async () => {
    setFetch(async () => json({ message: "boom" }, 503));
    await expectRejectCode(
      () =>
        getPreviewDeployment({ token: "t", owner: "a", repo: "b", sha: SHA }),
      "upstream_error",
    );
  });

  test("a 200 with an unreadable body → upstream_error", async () => {
    setFetch(
      async () =>
        new Response("<html>not json</html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
    );
    await expectRejectCode(
      () =>
        getPreviewDeployment({ token: "t", owner: "a", repo: "b", sha: SHA }),
      "upstream_error",
    );
  });
});
