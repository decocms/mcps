import { expect, test } from "bun:test";
import { deflateRawSync } from "node:zlib";
import { compileSchema, encodeBinarySchema, parseSchema } from "kiwi-schema";
import { pages, parseCanvas, view } from "./fig.ts";

// Synthetic fig-kiwi file with a minimal schema shaped like Figma's.
const schema = parseSchema(`
struct GUID { uint sessionID; uint localID; }
message ParentIndex { GUID guid = 1; string position = 2; }
message TextData { string characters = 1; }
message NodeChange { GUID guid = 1; ParentIndex parentIndex = 2; string type = 3; string name = 4;
  TextData textData = 5; bool internalOnly = 6; byte[] hash = 7; TextData derivedTextData = 8; }
message Message { NodeChange[] nodeChanges = 1; }`);
const g = (l: number) => ({ sessionID: 0, localID: l });
const pi = (l: number, position: string) => ({ guid: g(l), position });
const data = (compileSchema(schema) as any).encodeMessage({
  nodeChanges: [
    { guid: g(0), type: "DOCUMENT", name: "Document" },
    { guid: g(2), parentIndex: pi(0, "b"), type: "CANVAS", name: "Doc" },
    { guid: g(1), parentIndex: pi(0, "a"), type: "CANVAS", name: "Cover" },
    {
      guid: g(9),
      parentIndex: pi(0, "z"),
      type: "CANVAS",
      name: "Internal",
      internalOnly: true,
    },
    {
      guid: g(3),
      parentIndex: pi(1, "a"),
      type: "TEXT",
      name: "Title",
      textData: { characters: "GUX BAUDUCCO" },
      derivedTextData: { characters: "glyphs" },
      hash: new Uint8Array(20),
    },
  ],
});
const u32 = (n: number) => new Uint8Array(new Uint32Array([n]).buffer);
const chunk = (b: Uint8Array) => [u32(b.length), b];
const canvas = new Uint8Array(
  Buffer.concat([
    new TextEncoder().encode("fig-kiwi"),
    u32(48),
    ...chunk(deflateRawSync(encodeBinarySchema(schema))),
    ...chunk(deflateRawSync(data)),
  ]),
);

test("parses a fig-kiwi document into an ordered tree", () => {
  const doc = parseCanvas(canvas);
  expect(doc.version).toBe(48);
  expect(pages(doc).map((p) => p.name)).toEqual(["Cover", "Doc"]);
  const title = doc.byId.get("0:3");
  expect(title?.text).toBe("GUX BAUDUCCO");
  if (!title) throw new Error("missing title");
  const v = view(title, 0);
  expect(v.hash).toBe("0".repeat(40));
  expect(v.derivedTextData).toBeUndefined();
  expect(v.guid).toBeUndefined();
});

test("rejects non-fig input", () => {
  expect(() => parseCanvas(new Uint8Array(16))).toThrow(/fig-kiwi/);
});
