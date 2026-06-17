import { describe, expect, test } from "bun:test";
import {
  assertAllowedRedirectUri,
  isAllowedRedirectUri,
} from "./redirect-allowlist.ts";

describe("isAllowedRedirectUri", () => {
  test("accepts the canonical origin", () => {
    expect(
      isAllowedRedirectUri("https://github-mcp.decocms.com/oauth/callback"),
    ).toBe(true);
  });

  test("accepts apex and arbitrary subdomains over https", () => {
    expect(isAllowedRedirectUri("https://decocms.com/cb")).toBe(true);
    expect(isAllowedRedirectUri("https://preview.decocms.com/cb")).toBe(true);
    expect(isAllowedRedirectUri("https://a.b.decocms.com/cb")).toBe(true);
  });

  test("allows loopback over http for local dev", () => {
    expect(isAllowedRedirectUri("http://localhost:8787/oauth/callback")).toBe(
      true,
    );
    expect(isAllowedRedirectUri("http://127.0.0.1:8787/cb")).toBe(true);
  });

  test("rejects non-loopback http", () => {
    expect(isAllowedRedirectUri("http://github-mcp.decocms.com/cb")).toBe(
      false,
    );
  });

  test("rejects look-alike and suffix-confusion hosts", () => {
    expect(isAllowedRedirectUri("https://evildecocms.com/cb")).toBe(false);
    expect(isAllowedRedirectUri("https://decocms.com.attacker.io/cb")).toBe(
      false,
    );
    expect(isAllowedRedirectUri("https://decocms.com.evil/cb")).toBe(false);
    expect(isAllowedRedirectUri("https://notdecocms.com/cb")).toBe(false);
  });

  test("rejects other schemes and malformed input", () => {
    expect(isAllowedRedirectUri("javascript:alert(1)")).toBe(false);
    expect(isAllowedRedirectUri("ftp://decocms.com/cb")).toBe(false);
    expect(isAllowedRedirectUri("not a url")).toBe(false);
    expect(isAllowedRedirectUri("")).toBe(false);
  });

  test("is case-insensitive on the host", () => {
    expect(isAllowedRedirectUri("https://GitHub-MCP.DecoCMS.com/cb")).toBe(
      true,
    );
  });
});

describe("assertAllowedRedirectUri", () => {
  test("passes for an allowed uri", () => {
    expect(() =>
      assertAllowedRedirectUri("https://github-mcp.decocms.com/oauth/callback"),
    ).not.toThrow();
  });

  test("throws for a disallowed uri", () => {
    expect(() => assertAllowedRedirectUri("https://attacker.io/cb")).toThrow(
      /Refusing OAuth redirect_uri/,
    );
  });
});
