import { describe, expect, test } from "bun:test";
import {
  decryptCredential,
  encryptCredential,
  signState,
  verifyShopifyHmac,
  verifyState,
} from "./token.ts";
import { createHmac } from "node:crypto";

const SECRET = "test-secret-please-ignore";

describe("signState / verifyState", () => {
  test("round-trips a payload", () => {
    const token = signState(
      { cb: "https://mesh.example.com/oauth/callback" },
      SECRET,
    );
    expect(verifyState<{ cb: string }>(token, SECRET)).toEqual({
      cb: "https://mesh.example.com/oauth/callback",
    });
  });

  test("rejects a tampered body", () => {
    const token = signState({ cb: "https://good.example.com" }, SECRET);
    const [, sig] = token.split(".");
    const forged = `${Buffer.from(JSON.stringify({ cb: "https://evil.example.com" })).toString("base64url")}.${sig}`;
    expect(verifyState(forged, SECRET)).toBeNull();
  });

  test("rejects a wrong secret", () => {
    const token = signState({ cb: "x" }, SECRET);
    expect(verifyState(token, "other-secret")).toBeNull();
  });

  test("rejects a malformed token", () => {
    expect(verifyState("not-a-token", SECRET)).toBeNull();
  });
});

describe("encryptCredential / decryptCredential", () => {
  test("round-trips a sealed credential", () => {
    const sealed = encryptCredential(
      { shop: "my-store.myshopify.com", token: "shpat_secret" },
      SECRET,
    );
    expect(
      decryptCredential<{ shop: string; token: string }>(sealed, SECRET),
    ).toEqual({
      shop: "my-store.myshopify.com",
      token: "shpat_secret",
    });
  });

  test("does not leak the token in plaintext", () => {
    const sealed = encryptCredential({ token: "shpat_secret" }, SECRET);
    expect(sealed).not.toContain("shpat_secret");
  });

  test("produces a fresh ciphertext each time (random IV)", () => {
    const payload = { shop: "s.myshopify.com", token: "t" };
    expect(encryptCredential(payload, SECRET)).not.toBe(
      encryptCredential(payload, SECRET),
    );
  });

  test("returns null on a wrong secret", () => {
    const sealed = encryptCredential({ token: "t" }, SECRET);
    expect(decryptCredential(sealed, "other-secret")).toBeNull();
  });

  test("returns null on a non-credential string (e.g. a raw token)", () => {
    expect(decryptCredential("shpat_rawtoken", SECRET)).toBeNull();
  });
});

describe("verifyShopifyHmac", () => {
  function sign(params: Record<string, string>, secret: string): string {
    const message = Object.entries(params)
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join("&");
    return createHmac("sha256", secret).update(message).digest("hex");
  }

  test("accepts a valid Shopify HMAC", () => {
    const base = { code: "abc", shop: "s.myshopify.com", state: "xyz" };
    const params = new URLSearchParams({ ...base, hmac: sign(base, SECRET) });
    expect(verifyShopifyHmac(params, SECRET)).toBe(true);
  });

  test("rejects a bad HMAC", () => {
    const params = new URLSearchParams({
      code: "abc",
      shop: "s.myshopify.com",
      hmac: "deadbeef",
    });
    expect(verifyShopifyHmac(params, SECRET)).toBe(false);
  });

  test("rejects when hmac is absent", () => {
    const params = new URLSearchParams({ code: "abc" });
    expect(verifyShopifyHmac(params, SECRET)).toBe(false);
  });
});
