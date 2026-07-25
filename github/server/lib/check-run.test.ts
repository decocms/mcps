import { afterEach, describe, expect, test } from "bun:test";
import { CheckRunError, getCheckRun } from "./check-run.ts";

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
  code: CheckRunError["code"],
): Promise<CheckRunError> {
  let caught: unknown;
  try {
    await fn();
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(CheckRunError);
  expect((caught as CheckRunError).code).toBe(code);
  return caught as CheckRunError;
}

describe("getCheckRun", () => {
  test("returns the check run mapped with its output", async () => {
    setFetch(async (input, init) => {
      expect(urlOf(input)).toBe(
        "https://api.github.com/repos/acme/web/check-runs/123",
      );
      const headers = (init as { headers: Record<string, string> }).headers;
      expect(headers.Authorization).toBe("Bearer ghs_tok");
      return json({
        id: 123,
        name: "Deco / QA / Purchase journey",
        status: "completed",
        conclusion: "success",
        html_url: "https://github.com/acme/web/runs/123",
        details_url: "https://deco.cx/githubapp",
        output: {
          title: "desktop — pass",
          summary: "| step | status |\n| --- | --- |\n| visit-home | ✅ |",
          text: null,
        },
      });
    });

    const r = await getCheckRun({
      token: "ghs_tok",
      owner: "acme",
      repo: "web",
      checkRunId: 123,
    });

    expect(r).toEqual({
      id: 123,
      name: "Deco / QA / Purchase journey",
      status: "completed",
      conclusion: "success",
      htmlUrl: "https://github.com/acme/web/runs/123",
      detailsUrl: "https://deco.cx/githubapp",
      output: {
        title: "desktop — pass",
        summary: "| step | status |\n| --- | --- |\n| visit-home | ✅ |",
        text: null,
      },
    });
  });

  test("defaults a missing output block to nulls", async () => {
    setFetch(async () => json({ id: 5, name: "build", status: "completed" }));
    const r = await getCheckRun({
      token: "t",
      owner: "a",
      repo: "b",
      checkRunId: 5,
    });
    expect(r.output).toEqual({ title: null, summary: null, text: null });
    expect(r.conclusion).toBeNull();
  });

  test("falls back when id/status are absent (echoes id, status 'unknown')", async () => {
    setFetch(async () => json({ name: "build" }));
    const r = await getCheckRun({
      token: "t",
      owner: "a",
      repo: "b",
      checkRunId: 77,
    });
    expect(r.id).toBe(77);
    expect(r.status).toBe("unknown");
  });

  test("percent-encodes owner/repo path segments", async () => {
    setFetch(async (input) => {
      // Valid dotted names must be encoded, not concatenated raw.
      expect(urlOf(input)).toBe(
        "https://api.github.com/repos/deco-cx/my.repo/check-runs/9",
      );
      return json({ id: 9, name: "x", status: "completed" });
    });
    await getCheckRun({
      token: "t",
      owner: "deco-cx",
      repo: "my.repo",
      checkRunId: 9,
    });
  });

  test("rejects owner/repo with path-injection characters before fetching", async () => {
    setFetch(async () => {
      throw new Error("should not fetch");
    });
    for (const bad of ["..", "a/b", "x?y", "../../user"]) {
      await expectRejectCode(
        () => getCheckRun({ token: "t", owner: bad, repo: "b", checkRunId: 1 }),
        "invalid_input",
      );
      await expectRejectCode(
        () => getCheckRun({ token: "t", owner: "a", repo: bad, checkRunId: 1 }),
        "invalid_input",
      );
    }
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
      () => getCheckRun({ token: "t", owner: "a", repo: "b", checkRunId: 1 }),
      "upstream_error",
    );
  });

  test("403 → unauthorized (token may lack checks:read)", async () => {
    setFetch(async () => json({ message: "Resource not accessible" }, 403));
    await expectRejectCode(
      () => getCheckRun({ token: "t", owner: "a", repo: "b", checkRunId: 1 }),
      "unauthorized",
    );
  });

  test("404 → not_found", async () => {
    setFetch(async () => json({ message: "Not Found" }, 404));
    await expectRejectCode(
      () => getCheckRun({ token: "t", owner: "a", repo: "b", checkRunId: 1 }),
      "not_found",
    );
  });

  test("5xx → upstream_error", async () => {
    setFetch(async () => json({ message: "boom" }, 503));
    await expectRejectCode(
      () => getCheckRun({ token: "t", owner: "a", repo: "b", checkRunId: 1 }),
      "upstream_error",
    );
  });

  test("missing token → unauthorized without a network call", async () => {
    setFetch(async () => {
      throw new Error("should not fetch");
    });
    await expectRejectCode(
      () => getCheckRun({ token: "", owner: "a", repo: "b", checkRunId: 1 }),
      "unauthorized",
    );
  });

  test("non-positive check run id → invalid_input", async () => {
    setFetch(async () => {
      throw new Error("should not fetch");
    });
    await expectRejectCode(
      () => getCheckRun({ token: "t", owner: "a", repo: "b", checkRunId: 0 }),
      "invalid_input",
    );
  });
});
