import { describe, expect, test } from "bun:test";
import {
  normalizeRedirectHostSuffix,
  resolveAllowedRedirectHosts,
} from "./constants.ts";

describe("normalizeRedirectHostSuffix", () => {
  test("keeps a bare host", () => {
    expect(normalizeRedirectHostSuffix("studio.example.com")).toBe(
      "studio.example.com",
    );
  });

  test("reduces a full callback URL to its host", () => {
    expect(
      normalizeRedirectHostSuffix("https://studio.example.com/oauth/callback"),
    ).toBe("studio.example.com");
  });

  test("lowercases and trims", () => {
    expect(normalizeRedirectHostSuffix("  Studio.Example.COM  ")).toBe(
      "studio.example.com",
    );
  });

  test("rejects single-label values that would open a whole TLD", () => {
    expect(normalizeRedirectHostSuffix("com")).toBeNull();
    expect(normalizeRedirectHostSuffix("localhost")).toBeNull();
  });

  test("rejects unparseable entries", () => {
    expect(normalizeRedirectHostSuffix("")).toBeNull();
    expect(normalizeRedirectHostSuffix("http://")).toBeNull();
  });
});

describe("resolveAllowedRedirectHosts", () => {
  test("defaults to the built-in suffix when unset", () => {
    expect(resolveAllowedRedirectHosts(undefined)).toEqual(["decocms.com"]);
    expect(resolveAllowedRedirectHosts("")).toEqual(["decocms.com"]);
  });

  test("appends normalized extras", () => {
    expect(
      resolveAllowedRedirectHosts(
        "https://a.example.com/oauth/callback, b.example.org",
      ),
    ).toEqual(["decocms.com", "a.example.com", "b.example.org"]);
  });

  test("drops bad entries but keeps the good ones", () => {
    expect(resolveAllowedRedirectHosts("com, a.example.com")).toEqual([
      "decocms.com",
      "a.example.com",
    ]);
  });

  test("dedupes, including against the built-in", () => {
    expect(
      resolveAllowedRedirectHosts("decocms.com, a.example.com, a.example.com"),
    ).toEqual(["decocms.com", "a.example.com"]);
  });
});
