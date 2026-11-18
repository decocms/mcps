import { afterEach, describe, expect, it } from "bun:test";
import { GTMClient } from "./gtm-client.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("updateTag", () => {
  it("keeps the fields the caller did not send (GTM PUT replaces the entity)", async () => {
    const current = {
      tagId: "7",
      name: "Clarity",
      type: "html",
      fingerprint: "1",
      parentFolderId: "644",
      consentSettings: {
        consentStatus: "needed",
        consentType: {
          type: "list",
          list: [{ type: "template", value: "analytics_storage" }],
        },
      },
      setupTag: [{ tagName: "loader" }],
      firingTriggerId: ["2147479553"],
    };
    let sent: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        sent = JSON.parse(init.body as string);
        return new Response(JSON.stringify(sent));
      }
      return new Response(JSON.stringify(current));
    }) as typeof fetch;

    await new GTMClient({ accessToken: "t" }).updateTag("1", "2", "3", "7", {
      fingerprint: "1",
      name: "Clarity",
      type: "html",
      firingTriggerId: ["2147479553", "703"],
      notes: undefined,
    });

    expect(sent?.firingTriggerId).toEqual(["2147479553", "703"]);
    expect(sent?.consentSettings).toEqual(current.consentSettings);
    expect(sent?.parentFolderId).toBe("644");
    expect(sent?.setupTag).toEqual(current.setupTag);
    expect("notes" in (sent ?? {})).toBe(false);
  });
});
