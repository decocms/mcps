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
