import { describe, expect, it } from "bun:test";
import type { Env } from "../../shared/deco.gen.ts";
import { resolveServiceAccount, withToken } from "./sa-auth.ts";

const key = (clientEmail: string) =>
  JSON.stringify({
    type: "service_account",
    private_key: "-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----",
    client_email: clientEmail,
  });

const env = (stateKey?: string | null, managedKey?: string): Env =>
  ({
    GOOGLE_SERVICE_ACCOUNT_JSON: managedKey,
    MESH_REQUEST_CONTEXT: { state: { SERVICE_ACCOUNT_JSON: stateKey } },
  }) as Env;

describe("resolveServiceAccount", () => {
  it("prefers the connection key, so quota stays in the customer's project", () => {
    const resolved = resolveServiceAccount(
      env(key("theirs@x.iam"), key("ours@deco.iam")),
    );
    expect(resolved.source).toBe("connection");
    expect(resolved.clientEmail).toBe("theirs@x.iam");
  });

  it("falls back to the managed key when the connection has none", () => {
    const resolved = resolveServiceAccount(env(null, key("ours@deco.iam")));
    expect(resolved.source).toBe("deco-managed");
    expect(resolved.clientEmail).toBe("ours@deco.iam");
  });

  it("treats a blank pasted key as absent", () => {
    expect(resolveServiceAccount(env("   ", key("ours@deco.iam"))).source).toBe(
      "deco-managed",
    );
  });

  it("explains what to configure when neither exists", () => {
    expect(() => resolveServiceAccount(env())).toThrow(
      /No service account configured/,
    );
  });
});

describe("withToken", () => {
  it("clones the request context instead of mutating the shared one", () => {
    const base = env(key("a@x.iam"));
    const ctx = base.MESH_REQUEST_CONTEXT;

    const cloned = withToken(base, "bearer-a");

    expect(cloned.MESH_REQUEST_CONTEXT.authorization).toBe("bearer-a");
    expect(ctx.authorization).toBeUndefined();
    expect(cloned.MESH_REQUEST_CONTEXT).not.toBe(ctx);
    // State still reachable — tools read propertyId off the same context.
    expect(cloned.MESH_REQUEST_CONTEXT.state?.SERVICE_ACCOUNT_JSON).toBe(
      base.MESH_REQUEST_CONTEXT.state?.SERVICE_ACCOUNT_JSON,
    );
  });
});
