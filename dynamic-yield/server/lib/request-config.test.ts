import { describe, expect, it } from "bun:test";
import type { Env } from "../types/env.ts";
import { withHeaderConfig, withRequestHeaders } from "./request-config.ts";

const env = (state: Record<string, unknown>) =>
  ({ MESH_REQUEST_CONTEXT: { state } }) as unknown as Env;

describe("withHeaderConfig", () => {
  it("fills empty state from x-dy-* headers, Studio state wins", () => {
    const headers = new Headers({
      "x-dy-admin-email": "a@b.c",
      "x-dy-section-id": "1",
    });
    const state = withRequestHeaders(
      headers,
      () =>
        withHeaderConfig(env({ sectionId: "2", adminEmail: "" }))
          .MESH_REQUEST_CONTEXT?.state,
    );
    expect(state as unknown).toEqual({ adminEmail: "a@b.c", sectionId: "2" });
  });

  it("rejects an unknown region", () => {
    expect(() =>
      withRequestHeaders(new Headers({ "x-dy-region": "br" }), () =>
        withHeaderConfig(env({})),
      ),
    ).toThrow('must be "us" or "eu"');
  });
});
