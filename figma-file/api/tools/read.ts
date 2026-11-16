import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { type Node, pages, summary, view, walk } from "../lib/fig.ts";
import {
  checkId,
  evict,
  ID_RE,
  type Info,
  keys,
  loadDoc,
  PREFIX,
  readInfo,
} from "../lib/files.ts";
import { deleteKeys, listKeys } from "../lib/storage.ts";
import type { Env } from "../types/env.ts";

const LIMIT = 200;
const RO = { readOnlyHint: true, openWorldHint: false } as const;
const file = z
  .string()
  .describe("File id from figma_list_files / figma_import");
const nodeId = z
  .string()
  .describe("Node id like '1:2' (or the node-id from a Figma URL, '1-2')");

export async function listFiles(env: Env): Promise<Info[]> {
  const ids = (await listKeys(env, PREFIX))
    .map((o) => o.key.slice(PREFIX.length).split("/"))
    .filter(([id, f]) => ID_RE.test(id) && f === "info.json")
    .map(([id]) => id);
  const infos = await Promise.all(ids.map((id) => readInfo(env, id)));
  return infos.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

async function nodeOf(env: Env, fileId: string, id: string): Promise<Node> {
  const n = (await loadDoc(env, fileId)).byId.get(id.replace("-", ":"));
  if (!n) throw new Error(`node ${id} not found`);
  return n;
}

export const listFilesTool = (env: Env) =>
  createPrivateTool({
    id: "figma_list_files",
    description:
      "Figma files imported into this workspace (id, name, pages). If the file the user wants is missing, call figma_import.",
    inputSchema: z.object({}),
    annotations: RO,
    execute: async () => ({ files: await listFiles(env) }),
  });

export const getPagesTool = (env: Env) =>
  createPrivateTool({
    id: "figma_get_pages",
    description: "Pages of an imported Figma file with their top-level frames.",
    inputSchema: z.object({ file }),
    annotations: RO,
    execute: async ({ context }) => ({
      pages: pages(await loadDoc(env, context.file)).map((p) => ({
        ...summary(p),
        frames: p.children.map(summary),
      })),
    }),
  });

export const getNodeTool = (env: Env) =>
  createPrivateTool({
    id: "figma_get_node",
    description:
      "All properties of a node (fills, strokes, effects, auto-layout, text, component props…), children expanded to `depth`.",
    inputSchema: z.object({
      file,
      id: nodeId,
      depth: z.number().int().min(0).max(5).default(1),
    }),
    annotations: RO,
    execute: async ({ context }) => ({
      node: view(await nodeOf(env, context.file, context.id), context.depth),
    }),
  });

export const searchTool = (env: Env) =>
  createPrivateTool({
    id: "figma_search",
    description: `Find nodes whose name or text contains \`query\` (case-insensitive), optionally filtered by type (FRAME, TEXT, SYMBOL = component, INSTANCE, CANVAS = page…) and subtree. Max ${LIMIT} results.`,
    inputSchema: z.object({
      file,
      query: z.string().default(""),
      type: z.string().optional(),
      under: nodeId.optional(),
    }),
    annotations: RO,
    execute: async ({ context: { file: f, query, type, under } }) => {
      const q = query.toLowerCase();
      const start = under
        ? await nodeOf(env, f, under)
        : (await loadDoc(env, f)).root;
      const results = [];
      for (const n of walk(start)) {
        if (type && n.type !== type) continue;
        const text = n.text;
        if (q && !`${n.name ?? ""}\n${text ?? ""}`.toLowerCase().includes(q))
          continue;
        results.push({ ...summary(n), text: text?.slice(0, 200) });
        if (results.length >= LIMIT) break;
      }
      return { results, truncated: results.length >= LIMIT };
    },
  });

export const getTextsTool = (env: Env) =>
  createPrivateTool({
    id: "figma_get_texts",
    description: "All text content under a node or page, in layer order.",
    inputSchema: z.object({ file, id: nodeId }),
    annotations: RO,
    execute: async ({ context }) => ({
      texts: [...walk(await nodeOf(env, context.file, context.id))]
        .filter((n) => n.text)
        .map((n) => ({ ...summary(n), text: n.text as string })),
    }),
  });

export const getStylesTool = (env: Env) =>
  createPrivateTool({
    id: "figma_get_styles",
    description:
      "Shared styles (fill / text / effect / grid) and variables defined in the file — the design tokens.",
    inputSchema: z.object({ file }),
    annotations: RO,
    execute: async ({ context }) => {
      const styles = [];
      for (const n of (await loadDoc(env, context.file)).byId.values())
        if (
          (n.styleType && n.styleType !== "NONE") ||
          n.type?.startsWith("VARIABLE")
        )
          styles.push(view(n, 0));
      return { styles };
    },
  });

export const deleteFileTool = (env: Env) =>
  createPrivateTool({
    id: "figma_delete_file",
    description: "Removes an imported Figma file from this workspace.",
    inputSchema: z.object({ file }),
    annotations: { destructiveHint: true, openWorldHint: false },
    execute: async ({ context }) => {
      const k = keys(checkId(context.file));
      await evict(env, context.file);
      await deleteKeys(
        env,
        (await listKeys(env, k.dir)).map((o) => o.key),
      );
      return { deleted: context.file };
    },
  });
