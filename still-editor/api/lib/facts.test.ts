import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Piece } from "./catalog.ts";
import type { Storage } from "./storage.ts";

const calls: Array<Record<string, unknown>> = [];
let failing: "none" | "chat" | "empty-chat" | "both" = "none";

mock.module("./connection.ts", () => ({
  callConnectionTool: async (
    _env: unknown,
    binding: string,
    name: string,
    args: Record<string, unknown>,
  ) => {
    calls.push({ binding, name, ...args });
    const onOpenRouter = args.provider === "openrouter";
    if (failing === "both" || (failing === "chat" && !onOpenRouter)) {
      throw new Error("SELF generate_text: unavailable");
    }
    // A Studio answering an unknown tool's call with an error object.
    if (failing === "empty-chat" && !onOpenRouter) {
      return { error: "Unknown tool: generate_text" };
    }
    return {
      text: `Here: ${JSON.stringify({
        views: ["front", "back"],
        color: "mustard",
        fabric: "lycra",
        shape: "bralette",
        hardware: "None.",
        wornWith: "mustard briefs",
      })}`,
      model: onOpenRouter
        ? "anthropic/claude-opus-5.5"
        : "anthropic/claude-sonnet-5",
    };
  },
}));

const { garmentFacts } = await import("./create.ts");

const env = { MESH_REQUEST_CONTEXT: { state: {} } } as never;

function memoryStore() {
  const saved = new Map<string, unknown>();
  const store = {
    getJson: async (path: string) => saved.get(path) ?? null,
    putJson: async (path: string, value: unknown) => {
      saved.set(path, value);
    },
  } as unknown as Storage;
  return { store, saved };
}

const piece = {
  productId: 151932,
  name: "Top Cris Mostarda",
  type: "top",
  color: "MOSTARDA",
  photos: [
    "https://img.example/top-cris-mostarda-151932/1.jpg",
    "https://img.example/top-cris-mostarda-151932/2.jpg",
  ],
} as Piece;

describe("garmentFacts", () => {
  beforeEach(() => {
    calls.length = 0;
    failing = "none";
  });

  it("reads the photos on the org's chat model through generate_text", async () => {
    const { store, saved } = memoryStore();
    const facts = await garmentFacts(env, store, piece);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ binding: "SELF", name: "generate_text" });
    expect(calls[0]?.provider).toBeUndefined();
    expect(calls[0]?.images).toEqual([
      {
        uri: "https://img.example/top-cris-mostarda-151932/1.jpg?w=1024&h=1024",
      },
      {
        uri: "https://img.example/top-cris-mostarda-151932/2.jpg?w=1024&h=1024",
      },
    ]);
    expect(facts).toMatchObject({
      color: "mustard",
      model: "anthropic/claude-sonnet-5",
      views: {
        "https://img.example/top-cris-mostarda-151932/1.jpg": "front",
        "https://img.example/top-cris-mostarda-151932/2.jpg": "back",
      },
    });
    expect(saved.get("pieces/151932/facts.json")).toEqual(facts);
  });

  it("falls back to the org's OpenRouter key when the chat model fails", async () => {
    failing = "chat";
    const facts = await garmentFacts(env, memoryStore().store, piece);

    expect(calls.map((call) => call.provider ?? "chat")).toEqual([
      "chat",
      "openrouter",
    ]);
    expect(calls[1]?.model).toBe("anthropic/claude-opus-5.5");
    expect(facts?.model).toBe("anthropic/claude-opus-5.5");
  });

  it("falls back when the chat model answers without text", async () => {
    failing = "empty-chat";
    const facts = await garmentFacts(env, memoryStore().store, piece);

    expect(calls.map((call) => call.provider ?? "chat")).toEqual([
      "chat",
      "openrouter",
    ]);
    expect(facts?.model).toBe("anthropic/claude-opus-5.5");
  });

  it("creates without facts when neither model can read the photos", async () => {
    failing = "both";
    const { store, saved } = memoryStore();
    expect(await garmentFacts(env, store, piece)).toBeNull();
    expect(saved.size).toBe(0);
  });

  it("keeps the stored facts, corrected or not, without asking again", async () => {
    const { store } = memoryStore();
    await garmentFacts(env, store, piece);
    calls.length = 0;
    await garmentFacts(env, store, piece);
    expect(calls).toHaveLength(0);
  });
});
