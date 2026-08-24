import { afterEach, beforeAll, describe, expect, it } from "bun:test";
import {
  getServiceAccountAccessToken,
  parseServiceAccountKey,
} from "./google-service-account.ts";

let pem: string;

beforeAll(async () => {
  const { privateKey } = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", privateKey);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(pkcs8)));
  pem = `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`;
});

const keyJson = (clientEmail: string) =>
  JSON.stringify({
    type: "service_account",
    project_id: "p",
    private_key_id: "kid",
    private_key: pem,
    client_email: clientEmail,
    client_id: "1",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
  });

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Captures the JWT assertions posted to Google and answers with a fake token. */
function stubTokenEndpoint() {
  const assertions: string[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const body = new URLSearchParams(init.body as string);
    assertions.push(body.get("assertion")!);
    return new Response(
      JSON.stringify({
        access_token: `token-${assertions.length}`,
        expires_in: 3600,
        token_type: "Bearer",
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
  return assertions;
}

const payloadOf = (jwt: string) =>
  JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(
        atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
        (c) => c.charCodeAt(0),
      ),
    ),
  );

describe("parseServiceAccountKey", () => {
  it("accepts a service account key with surrounding whitespace", () => {
    const key = parseServiceAccountKey(`\n  ${keyJson("sa@x.iam")}  \n`);
    expect(key.client_email).toBe("sa@x.iam");
  });

  it("names the mistake when given an OAuth client file", () => {
    const oauthClient = JSON.stringify({
      installed: { client_id: "1", client_secret: "s" },
    });
    expect(() => parseServiceAccountKey(oauthClient)).toThrow(
      /OAuth client file/,
    );
  });

  it("rejects a non-service-account key type", () => {
    expect(() =>
      parseServiceAccountKey(JSON.stringify({ type: "authorized_user" })),
    ).toThrow(/expected "service_account"/);
  });

  it("rejects malformed JSON", () => {
    expect(() => parseServiceAccountKey("not json")).toThrow(/not valid JSON/);
  });

  it("rejects a key missing private_key", () => {
    expect(() =>
      parseServiceAccountKey(
        JSON.stringify({ type: "service_account", client_email: "a@b" }),
      ),
    ).toThrow(/missing private_key/);
  });
});

describe("getServiceAccountAccessToken", () => {
  it("omits sub when no subject is given — GA4 grants the SA identity directly", async () => {
    const assertions = stubTokenEndpoint();
    await getServiceAccountAccessToken(keyJson("no-sub@x.iam"), [
      "https://www.googleapis.com/auth/analytics.readonly",
    ]);

    const payload = payloadOf(assertions[0]);
    expect(payload.sub).toBeUndefined();
    expect(payload.iss).toBe("no-sub@x.iam");
    expect(payload.scope).toBe(
      "https://www.googleapis.com/auth/analytics.readonly",
    );
    expect(payload.aud).toBe("https://oauth2.googleapis.com/token");
  });

  it("sets sub when impersonating — domain-wide delegation", async () => {
    const assertions = stubTokenEndpoint();
    await getServiceAccountAccessToken(
      keyJson("dwd@x.iam"),
      ["https://www.googleapis.com/auth/calendar"],
      "user@corp.com",
    );

    expect(payloadOf(assertions[0]).sub).toBe("user@corp.com");
  });

  it("caches by key identity, so two service accounts never share a token", async () => {
    const assertions = stubTokenEndpoint();
    const scopes = ["scope-for-cache-test"];

    const first = await getServiceAccountAccessToken(
      keyJson("one@x.iam"),
      scopes,
      "shared@corp.com",
    );
    const cached = await getServiceAccountAccessToken(
      keyJson("one@x.iam"),
      scopes,
      "shared@corp.com",
    );
    const other = await getServiceAccountAccessToken(
      keyJson("two@x.iam"),
      scopes,
      "shared@corp.com",
    );

    expect(cached).toBe(first);
    expect(other).not.toBe(first);
    expect(assertions).toHaveLength(2);
  });

  it("surfaces the status and body when Google rejects the assertion", async () => {
    globalThis.fetch = (async () =>
      new Response("invalid_grant", { status: 400 })) as typeof fetch;

    await expect(
      getServiceAccountAccessToken(keyJson("bad@x.iam"), ["s"]),
    ).rejects.toThrow(/400 - invalid_grant/);
  });
});
