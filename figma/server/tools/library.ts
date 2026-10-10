/**
 * Design-system tools. The REST API does not list a file's subscribed
 * libraries, so libraries are discovered from what the file (or node) actually
 * uses: every remote component/style key resolves to the library file that
 * publishes it.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import {
  type FileRef,
  getFileShallow,
  getNode,
  parseFigmaRef,
  tokenFrom,
} from "../lib/figma.ts";
import {
  fileName,
  type PublishedAsset,
  publishedInFile,
  publishedInTeam,
  resolveKeys,
} from "../lib/library.ts";
import { fileKeySchema, nodeIdSchema } from "./shared.ts";

const LOOKUP_BUDGET = 25;

export async function discoverLibraries(token: string, ref: FileRef) {
  const assets = ref.nodeId
    ? await getNode(token, ref)
    : await getFileShallow(token, ref.fileKey, 1);
  const keys: Array<{
    key: string;
    kind: "component" | "component_set" | "style";
  }> = [];
  const seen = new Set<string>();
  const push = (key: string, kind: "component" | "component_set" | "style") => {
    if (!seen.has(key)) {
      seen.add(key);
      keys.push({ key, kind });
    }
  };
  // A variant's set is the meaningful library unit; resolve it once.
  for (const c of Object.values(assets.components ?? {})) {
    if (!c.remote) continue;
    const set = c.componentSetId
      ? assets.componentSets?.[c.componentSetId]
      : undefined;
    if (set?.remote) push(set.key, "component_set");
    else push(c.key, "component");
  }
  for (const s of Object.values(assets.styles ?? {}))
    if (s.remote) push(s.key, "style");

  const { resolved, skipped } = await resolveKeys(token, keys, LOOKUP_BUDGET);
  const byFile = new Map<string, { components: string[]; styles: string[] }>();
  for (const a of resolved) {
    const entry = byFile.get(a.file_key) ?? { components: [], styles: [] };
    (a.style_type ? entry.styles : entry.components).push(a.name);
    byFile.set(a.file_key, entry);
  }
  const libraries = await Promise.all(
    [...byFile].map(async ([fileKey, used]) => ({
      fileKey,
      name: await fileName(token, fileKey),
      ...used,
    })),
  );
  return {
    fileName: "file" in assets ? assets.file.name : assets.name,
    libraries,
    skipped,
  };
}

export const getLibrariesTool = createPrivateTool({
  id: "get_libraries",
  description:
    "Design libraries a file (or one node) uses, with the library file keys and which of their components/styles appear, plus what the " +
    "file itself publishes. Feed the library file keys to search_design_system. Discovery is based on actual usage — the REST API " +
    `does not expose subscribed-but-unused libraries — and resolves at most ${LOOKUP_BUDGET} remote assets per call.`,
  inputSchema: z.object({ fileKey: fileKeySchema, nodeId: nodeIdSchema }),
  execute: async ({ context, runtimeContext }) => {
    const token = tokenFrom(runtimeContext);
    const ref = parseFigmaRef(context.fileKey, context.nodeId);
    const [found, components, sets, styles] = await Promise.all([
      discoverLibraries(token, ref),
      publishedInFile(token, ref.fileKey, "components").catch(() => []),
      publishedInFile(token, ref.fileKey, "component_sets").catch(() => []),
      publishedInFile(token, ref.fileKey, "styles").catch(() => []),
    ]);
    return {
      file: found.fileName,
      publishedInThisFile: {
        components: components.length,
        componentSets: sets.length,
        styles: styles.length,
      },
      libraries: found.libraries,
      ...(found.skipped
        ? {
            note: `${found.skipped} more remote assets were not resolved; pass a nodeId to narrow the scan.`,
          }
        : {}),
    };
  },
});

function score(asset: PublishedAsset, query: string): number {
  const q = query.toLowerCase().trim();
  const tokens = q.split(/[\s/_\-.]+/).filter(Boolean);
  const name = asset.name.toLowerCase();
  const hay =
    `${name} ${asset.description ?? ""} ${asset.containing_frame?.name ?? ""} ${asset.containing_frame?.pageName ?? ""}`.toLowerCase();
  const hits = tokens.filter((t) => hay.includes(t)).length;
  if (!hits) return 0;
  return (
    hits * 2 +
    (name === q ? 10 : name.includes(q) ? 4 : 0) +
    tokens.filter((t) => name.includes(t)).length
  );
}

export const searchDesignSystemTool = createPrivateTool({
  id: "search_design_system",
  description:
    "Search published components, component sets and styles by name/description across the libraries a file uses (auto-discovered), " +
    "explicit library file keys, and/or a whole team. Use before building UI to find the design-system piece the design used, then " +
    "get_code_connect_map to find its code counterpart. Variables are not searchable via REST without Enterprise.",
  inputSchema: z.object({
    queries: z
      .array(z.string().min(1))
      .min(1)
      .max(10)
      .describe(
        'Search terms, e.g. ["button primary", "product card", "color/brand"].',
      ),
    fileKey: fileKeySchema,
    nodeId: nodeIdSchema.describe(
      "Limit library discovery to what this node uses.",
    ),
    libraryFileKeys: z
      .array(z.string())
      .max(10)
      .default([])
      .describe(
        "Library files to search (from get_libraries). Skips discovery.",
      ),
    teamId: z
      .string()
      .optional()
      .describe(
        "Also search every library published by this team (figma.com/files/team/<id>).",
      ),
    includeComponents: z.boolean().default(true),
    includeStyles: z.boolean().default(true),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10)
      .describe("Results per query."),
  }),
  execute: async ({ context, runtimeContext }) => {
    const token = tokenFrom(runtimeContext);
    const ref = parseFigmaRef(context.fileKey, context.nodeId);

    let files = context.libraryFileKeys.map((k) => parseFigmaRef(k).fileKey);
    if (!files.length && !context.teamId) {
      files = (await discoverLibraries(token, ref)).libraries.map(
        (l) => l.fileKey,
      );
    }
    files = [...new Set([ref.fileKey, ...files])];

    const kinds = [
      ...(context.includeComponents
        ? (["components", "component_sets"] as const)
        : []),
      ...(context.includeStyles ? (["styles"] as const) : []),
    ];
    const lists = await Promise.all([
      ...files.flatMap((f) =>
        kinds.map((k) =>
          publishedInFile(token, f, k).catch(() => [] as PublishedAsset[]),
        ),
      ),
      ...(context.teamId
        ? kinds.map((k) =>
            publishedInTeam(token, context.teamId!, k).catch(
              () => [] as PublishedAsset[],
            ),
          )
        : []),
    ]);

    const pool = new Map<string, PublishedAsset & { type: string }>();
    lists.forEach((list, i) => {
      const kind = kinds[i % kinds.length];
      for (const a of list) {
        // Variants surface through their set; skip them individually.
        if (kind === "components" && a.containing_frame?.containingComponentSet)
          continue;
        pool.set(a.key, {
          ...a,
          type:
            kind === "styles"
              ? `style:${a.style_type?.toLowerCase()}`
              : kind === "component_sets"
                ? "component_set"
                : "component",
        });
      }
    });

    const results = Object.fromEntries(
      context.queries.map((q) => [
        q,
        [...pool.values()]
          .map((a) => ({ a, s: score(a, q) }))
          .filter((x) => x.s > 0)
          .sort((x, y) => y.s - x.s)
          .slice(0, context.limit)
          .map(({ a }) => ({
            type: a.type,
            name: a.name,
            key: a.key,
            fileKey: a.file_key,
            nodeId: a.node_id,
            page: a.containing_frame?.pageName,
            description: a.description || undefined,
            thumbnail: a.thumbnail_url,
          })),
      ]),
    );
    return {
      results,
      searched: { files, team: context.teamId ?? null, assets: pool.size },
    };
  },
});
