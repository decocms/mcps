import { expect, test } from "bun:test";
import { notAgenticError } from "./mcp-proxy.ts";

test("explains Google's not-agentic rejection instead of a re-auth hint", () => {
  const err = notAgenticError(
    "The client is not marked as an AI agent. See https://...",
  );
  expect(err?.message).toContain("not marked as agentic");
  expect(err?.message).toContain("Re-authenticating will not help");
});

test("leaves ordinary errors alone", () => {
  expect(
    notAgenticError("Request had insufficient authentication scopes."),
  ).toBeNull();
});
