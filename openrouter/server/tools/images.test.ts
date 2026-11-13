import { describe, expect, it } from "bun:test";
import { buildImageRequest, requireConnectionKey } from "./images.ts";

describe("requireConnectionKey", () => {
  it("never falls back to the deployment's key", () => {
    process.env.OPENROUTER_API_KEY = "deployment-key";
    expect(() => requireConnectionKey(undefined)).toThrow(/no account key/);
    expect(() => requireConnectionKey("  ")).toThrow(/no account key/);
    delete process.env.OPENROUTER_API_KEY;
  });

  it("uses the connection's key", () => {
    expect(requireConnectionKey(" sk-or-connection ")).toBe("sk-or-connection");
  });
});

describe("buildImageRequest", () => {
  it("puts OpenAI moderation under provider options, where OpenRouter reads it", () => {
    const body = buildImageRequest(
      {
        model: "openai/gpt-image-2.6-sunburst",
        prompt: "p",
        size: "1536x2304",
        moderation: "low",
      },
      ["data:image/png;base64,AA=="],
    );
    expect(body.moderation).toBeUndefined();
    expect(body.provider).toEqual({
      options: { openai: { moderation: "low" } },
    });
    expect(body.size).toBe("1536x2304");
    expect(body.input_references).toEqual([
      { type: "image_url", image_url: { url: "data:image/png;base64,AA==" } },
    ]);
  });

  it("ignores moderation for other providers", () => {
    const body = buildImageRequest(
      { model: "google/gemini-3-pro-image", prompt: "p", moderation: "low" },
      [],
    );
    expect(body.provider).toBeUndefined();
    expect(body.input_references).toBeUndefined();
  });
});
