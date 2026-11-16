// Parser for Figma .fig files ("Save local copy"). Ported from decocms/figma-local-mcp.
// canvas.fig = "fig-kiwi" magic + u32 version + [u32 len, bytes] chunks;
// chunk0 = compressed kiwi schema, chunk1 = compressed message (NODE_CHANGES).
import { inflateRawSync, zstdDecompressSync } from "node:zlib";
import { compileSchema, decodeBinarySchema } from "kiwi-schema";

/**
 * Slim node kept in memory. The full kiwi object for a 60k-node file is
 * ~700 MB of heap (tens of thousands of tiny objects); keeping only the fields
 * tools filter on plus each node's properties as one JSON string is ~10x
 * smaller. `props` is parsed on demand by `view`.
 */
export type Node = {
  id: string;
  type: string;
  name?: string;
  text?: string;
  styleType?: string;
  internalOnly?: boolean;
  props: string;
  children: Node[];
};
export type Doc = { version: number; root: Node; byId: Map<string, Node> };

const isZstd = (b: Uint8Array) =>
  b[0] === 0x28 && b[1] === 0xb5 && b[2] === 0x2f && b[3] === 0xfd;
const decompress = (b: Uint8Array): Uint8Array =>
  new Uint8Array(isZstd(b) ? zstdDecompressSync(b) : inflateRawSync(b));

const gid = (g: { sessionID: number; localID: number }) =>
  `${g.sessionID}:${g.localID}`;

export function parseCanvas(buf: Uint8Array): Doc {
  const magic = new TextDecoder().decode(buf.subarray(0, 8));
  if (!magic.startsWith("fig-"))
    throw new Error(`not a fig-kiwi file (magic "${magic}")`);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const chunks: Uint8Array[] = [];
  for (let off = 12; off + 4 <= buf.length; ) {
    const len = view.getUint32(off, true);
    chunks.push(buf.subarray(off + 4, off + 4 + len));
    off += 4 + len;
  }
  if (chunks.length < 2) throw new Error("truncated fig-kiwi file");
  // biome-ignore lint/suspicious/noExplicitAny: compiled kiwi schema
  const schema: any = compileSchema(decodeBinarySchema(decompress(chunks[0])));
  const message = schema.decodeMessage(decompress(chunks[1]));
  return {
    version: view.getUint32(8, true),
    ...buildTree(message.nodeChanges ?? []),
  };
}

// Render caches (glyph outlines, baked instance trees, geometry blob refs):
// useless to an agent and the bulk of the decoded data.
const DROP = new Set([
  "guid",
  "parentIndex",
  "derivedTextData",
  "derivedSymbolData",
  "vectorData",
  "fillGeometry",
  "strokeGeometry",
]);

// JSON-safe: bigint → string, 20-byte image hashes → hex, other bytes elided.
const replacer = (_: string, v: unknown) =>
  typeof v === "bigint"
    ? v.toString()
    : v instanceof Uint8Array
      ? v.length === 20
        ? Buffer.from(v).toString("hex")
        : `[${v.length} bytes]`
      : v;

// biome-ignore lint/suspicious/noExplicitAny: kiwi NodeChange
export function buildTree(nodeChanges: any[]) {
  const byId = new Map<string, Node>();
  const parent = new Map<Node, { id: string; pos: string }>();
  for (const nc of nodeChanges) {
    // biome-ignore lint/suspicious/noExplicitAny: kiwi NodeChange
    const props: Record<string, any> = {};
    for (const k in nc) if (!DROP.has(k)) props[k] = nc[k];
    const n: Node = {
      id: gid(nc.guid),
      type: nc.type,
      name: nc.name,
      text: nc.textData?.characters,
      styleType: nc.styleType,
      internalOnly: nc.internalOnly,
      props: JSON.stringify(props, replacer),
      children: [],
    };
    byId.set(n.id, n);
    if (nc.parentIndex)
      parent.set(n, {
        id: gid(nc.parentIndex.guid),
        pos: nc.parentIndex.position,
      });
  }
  let root: Node | undefined;
  for (const n of byId.values()) {
    const p = parent.get(n);
    const pn = p && byId.get(p.id);
    if (pn) pn.children.push(n);
    else if (n.type === "DOCUMENT") root = n;
  }
  // Sibling order is the fractional-index string in parentIndex.position.
  const pos = (n: Node) => parent.get(n)?.pos ?? "";
  for (const n of byId.values())
    n.children.sort((a, b) => (pos(a) < pos(b) ? -1 : pos(a) > pos(b) ? 1 : 0));
  if (!root) throw new Error("no DOCUMENT node");
  return { root, byId };
}

export const pages = (doc: Doc) =>
  doc.root.children.filter((c) => c.type === "CANVAS" && !c.internalOnly);

export const summary = (n: Node) => ({ id: n.id, type: n.type, name: n.name });

export function* walk(n: Node): Generator<Node> {
  yield n;
  for (const c of n.children) yield* walk(c);
}

/** Full properties of a node, children expanded to `depth` (summaries below). */
// biome-ignore lint/suspicious/noExplicitAny: arbitrary node shape
export function view(n: Node, depth = 1): any {
  return {
    id: n.id,
    ...JSON.parse(n.props),
    children:
      depth > 0
        ? n.children.map((c) => view(c, depth - 1))
        : n.children.map(summary),
  };
}
