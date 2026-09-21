import { describe, expect, test } from "bun:test";
import { type AppJson, buildRegistryData } from "./registry-payload";

const app: AppJson = {
  scopeName: "example",
  name: "example-mcp",
  friendlyName: "Example MCP",
  official: true,
  connection: { type: "HTTP", url: "https://example.com/mcp" },
};

describe("registry verification", () => {
  test("keeps an explicitly unverified official server unverified", () => {
    const item = buildRegistryData({
      ...app,
      metadata: { official: true, verified: false },
    });
    expect(item._meta?.["mcp.mesh"]?.verified).toBe(false);
  });

  test("allows a verified integration without marking it official", () => {
    const item = buildRegistryData({
      ...app,
      metadata: { official: false, verified: true },
    });
    expect(item._meta?.["mcp.mesh"]?.verified).toBe(true);
  });

  test("preserves the existing fallback when verification is unspecified", () => {
    expect(buildRegistryData(app)._meta?.["mcp.mesh"]?.verified).toBe(true);
    expect(
      buildRegistryData({ ...app, official: false })._meta?.["mcp.mesh"]
        ?.verified,
    ).toBe(false);
  });
});
