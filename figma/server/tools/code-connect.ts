/**
 * Code Connect over Figma dev resources.
 *
 * Figma's own Code Connect mappings are not readable through the public REST
 * API, so mappings live as dev resources: a link from a main component (or
 * component set) to its code. They show up in Dev Mode for designers and
 * developers too, and need no extra tooling to publish.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { designOutline } from "../lib/design.ts";
import {
  type FigmaNode,
  figmaFetch,
  getNode,
  type NodesResponse,
  parseFigmaRef,
  tokenFrom,
  walk,
} from "../lib/figma.ts";
import {
  type DevResource,
  devResources,
  publishedInFile,
  resolveKeys,
} from "../lib/library.ts";
import { fileKeySchema, nodeIdSchema, text } from "./shared.ts";

type NodeEntry = NonNullable<NodesResponse["nodes"][string]>;

interface MainComponent {
  /** Where the main component (set) lives. */
  fileKey: string;
  nodeId: string;
  name: string;
  instances: string[];
}

/** Main components behind every instance (and component) inside a subtree. */
async function mainComponents(
  token: string,
  fileKey: string,
  entry: NodeEntry,
): Promise<MainComponent[]> {
  const local = new Map<string, MainComponent>();
  const remote = new Map<
    string,
    {
      key: string;
      kind: "component" | "component_set";
      name: string;
      instances: string[];
    }
  >();

  walk(entry.document, (n) => {
    if (n.visible === false) return false;
    if (
      n.type === "COMPONENT_SET" ||
      (n.type === "COMPONENT" && !entry.components[n.id]?.componentSetId)
    ) {
      if (!local.has(n.id))
        local.set(n.id, { fileKey, nodeId: n.id, name: n.name, instances: [] });
      return;
    }
    if (n.type !== "INSTANCE" || !n.componentId) return;
    const comp = entry.components[n.componentId];
    if (!comp) return;
    const setId = comp.componentSetId;
    const set = setId ? entry.componentSets[setId] : undefined;
    if (!comp.remote) {
      const id = setId ?? n.componentId;
      const m: MainComponent = local.get(id) ?? {
        fileKey,
        nodeId: id,
        name: set?.name ?? comp.name,
        instances: [],
      };
      m.instances.push(n.id);
      local.set(id, m);
    } else {
      const key = set?.key ?? comp.key;
      const m = remote.get(key) ?? {
        key,
        kind: set ? ("component_set" as const) : ("component" as const),
        name: set?.name ?? comp.name,
        instances: [] as string[],
      };
      m.instances.push(n.id);
      remote.set(key, m);
    }
  });

  const { resolved } = await resolveKeys(
    token,
    [...remote.values()].map(({ key, kind }) => ({ key, kind })),
    40,
  );
  const remoteMains = resolved.map((a) => ({
    fileKey: a.file_key,
    nodeId: a.node_id,
    name: a.name,
    instances: remote.get(a.key)?.instances ?? [],
  }));
  return [...local.values(), ...remoteMains];
}

/** Dev resources for many mains, one request per file. */
async function resourcesFor(
  token: string,
  mains: MainComponent[],
): Promise<Map<string, DevResource[]>> {
  const byFile = new Map<string, string[]>();
  for (const m of mains)
    byFile.set(m.fileKey, [...(byFile.get(m.fileKey) ?? []), m.nodeId]);
  const out = new Map<string, DevResource[]>();
  await Promise.all(
    [...byFile].map(async ([fileKey, ids]) => {
      const list = await devResources(token, fileKey, ids).catch(() => []);
      for (const r of list)
        out.set(`${r.file_key}:${r.node_id}`, [
          ...(out.get(`${r.file_key}:${r.node_id}`) ?? []),
          r,
        ]);
    }),
  );
  return out;
}

export const getCodeConnectMapTool = createPrivateTool({
  id: "get_code_connect_map",
  description:
    "For every component used inside a node, the code component it maps to (Code Connect, stored as Figma dev resources on the main " +
    "component). Use the mapped components instead of rebuilding them. Unmapped ones are listed so you can find the code match and " +
    "record it with add_code_connect_map.",
  inputSchema: z.object({ fileKey: fileKeySchema, nodeId: nodeIdSchema }),
  execute: async ({ context, runtimeContext }) => {
    const token = tokenFrom(runtimeContext);
    const ref = parseFigmaRef(context.fileKey, context.nodeId);
    const entry = await getNode(token, ref);
    const mains = await mainComponents(token, ref.fileKey, entry);
    const resources = await resourcesFor(token, mains);

    const mapped = [];
    const unmapped = [];
    for (const m of mains) {
      const links = resources.get(`${m.fileKey}:${m.nodeId}`);
      const base = {
        component: m.name,
        fileKey: m.fileKey,
        nodeId: m.nodeId,
        instances: m.instances.length,
      };
      if (links?.length)
        mapped.push({
          ...base,
          code: links.map((l) => ({ label: l.name, url: l.url })),
        });
      else unmapped.push(base);
    }
    return { mapped, unmapped };
  },
});

export const addCodeConnectMapTool = createPrivateTool({
  id: "add_code_connect_map",
  description:
    "Record Code Connect mappings: link main components (or component sets) to their code as Figma dev resources, visible in Dev Mode. " +
    "Point nodeId at the MAIN component in the file that defines it (get_code_connect_map / get_code_connect_suggestions return " +
    "fileKey + nodeId for exactly that). source must be a URL, e.g. the GitHub blob URL of the component file. Writes to Figma — " +
    "only call it when the user asked to map components.",
  inputSchema: z.object({
    fileKey: fileKeySchema.describe(
      "File that defines the main components (the library file for remote components).",
    ),
    mappings: z

      .array(
        z.object({
          nodeId: z
            .string()
            .describe("Main component or component set node id."),
          source: z
            .string()
            .url()
            .describe(
              "URL of the code component, e.g. https://github.com/org/repo/blob/main/src/Button.tsx",
            ),
          label: z
            .string()
            .default("Code")
            .describe('Shown in Dev Mode, e.g. "React — Button".'),
        }),
      )

      .min(1)

      .max(50),
  }),
  execute: async ({ context, runtimeContext }) => {
    const token = tokenFrom(runtimeContext);
    const { fileKey } = parseFigmaRef(context.fileKey);
    return await figmaFetch<{
      links_created: DevResource[];
      errors: Array<{ node_id?: string; error: string }>;
    }>(token, "/v1/dev_resources", {
      method: "POST",
      body: {
        dev_resources: context.mappings.map((m) => ({
          name: m.label,
          url: m.source,
          file_key: fileKey,
          node_id: parseFigmaRef(fileKey, m.nodeId).nodeId,
        })),
      },
    });
  },
});

export const getCodeConnectSuggestionsTool = createPrivateTool({
  id: "get_code_connect_suggestions",
  description:
    "Components that still lack a Code Connect mapping — those used inside a node, or every component the file publishes when no node " +
    "is given. Match each to a component in the codebase (by name, props and get_context_for_code_connect), then save the matches with " +
    "add_code_connect_map.",
  inputSchema: z.object({ fileKey: fileKeySchema, nodeId: nodeIdSchema }),
  execute: async ({ context, runtimeContext }) => {
    const token = tokenFrom(runtimeContext);
    const ref = parseFigmaRef(context.fileKey, context.nodeId);

    let mains: MainComponent[];
    if (ref.nodeId) {
      mains = await mainComponents(
        token,
        ref.fileKey,
        await getNode(token, ref),
      );
    } else {
      const [sets, comps] = await Promise.all([
        publishedInFile(token, ref.fileKey, "component_sets"),
        publishedInFile(token, ref.fileKey, "components"),
      ]);
      mains = [
        ...sets,
        ...comps.filter((c) => !c.containing_frame?.containingComponentSet),
      ].map((a) => ({
        fileKey: a.file_key,
        nodeId: a.node_id,
        name: a.name,
        instances: [],
      }));
      if (!mains.length)
        return text(
          "This file publishes no components. Pass a nodeId to scan the components a design uses.",
        );
    }

    const resources = await resourcesFor(token, mains);
    const suggestions = mains

      .filter((m) => !resources.get(`${m.fileKey}:${m.nodeId}`)?.length)

      .map((m) => ({
        component: m.name,
        fileKey: m.fileKey,
        nodeId: m.nodeId,
        ...(m.instances.length ? { instances: m.instances.length } : {}),
      }));
    return { suggestions, alreadyMapped: mains.length - suggestions.length };
  },
});

export const getContextForCodeConnectTool = createPrivateTool({
  id: "get_context_for_code_connect",
  description:
    "Everything needed to map one component to code: its property definitions (variants with options, booleans, text, instance swaps, " +
    "defaults), variant names, layer structure of the default variant and existing mappings. Accepts an instance too — it follows it " +
    "to the main component, even in another library file.",
  inputSchema: z.object({ fileKey: fileKeySchema, nodeId: nodeIdSchema }),
  execute: async ({ context, runtimeContext }) => {
    const token = tokenFrom(runtimeContext);
    let ref = parseFigmaRef(context.fileKey, context.nodeId);
    let entry = await getNode(token, ref);

    // Follow instance → main component, and variant → its set.
    const goTo = async (fileKey: string, nodeId: string) => {
      ref = { fileKey, nodeId };
      entry = await getNode(token, ref);
    };
    const doc = entry.document;
    if (doc.type === "INSTANCE" && doc.componentId) {
      const comp = entry.components[doc.componentId];
      const set = comp?.componentSetId
        ? entry.componentSets[comp.componentSetId]
        : undefined;
      if (comp && !comp.remote)
        await goTo(ref.fileKey, comp.componentSetId ?? doc.componentId);
      else if (comp) {
        const { resolved } = await resolveKeys(
          token,
          [
            {
              key: set?.key ?? comp.key,
              kind: set ? "component_set" : "component",
            },
          ],
          1,
        );
        if (!resolved[0])
          throw new Error(
            `Main component "${comp.name}" is not published or not accessible to this account.`,
          );
        await goTo(resolved[0].file_key, resolved[0].node_id);
      }
    }
    if (
      entry.document.type === "COMPONENT" &&
      entry.components[entry.document.id]?.componentSetId
    ) {
      await goTo(
        ref.fileKey,
        entry.components[entry.document.id].componentSetId!,
      );
    }

    const main = entry.document;
    if (main.type !== "COMPONENT" && main.type !== "COMPONENT_SET") {
      throw new Error(
        `${main.type} "${main.name}" is not a component or instance.`,
      );
    }

    const props = Object.entries(
      (main.componentPropertyDefinitions ?? {}) as Record<
        string,
        { type: string; defaultValue: unknown; variantOptions?: string[] }
      >,
    )

      .map(
        ([name, d]) =>
          `- ${name.replace(/#\d+:\d+$/, "")} (${d.type.toLowerCase()}) default=${JSON.stringify(d.defaultValue)}${d.variantOptions ? ` options=${d.variantOptions.join(" | ")}` : ""}`,
      );
    const variants: FigmaNode[] =
      main.type === "COMPONENT_SET" ? (main.children ?? []) : [];
    const sample = variants[0] ?? main;
    const existing = await devResources(token, ref.fileKey, [main.id]).catch(
      () => [],
    );
    const description =
      entry.componentSets[main.id]?.description ||
      entry.components[main.id]?.description;

    return text(
      [
        `# ${main.type} "${main.name}" [${main.id}] in file ${ref.fileKey}`,
        description ? `Description: ${description}` : "",
        "",
        "## Properties",
        props.length ? props.join("\n") : "(none)",
        variants.length
          ? `\n## Variants (${variants.length})\n${variants
              .slice(0, 60)
              .map((v) => `- ${v.name} [${v.id}]`)
              .join("\n")}`
          : "",
        `\n## Layers of ${variants.length ? "the first variant" : "the component"}`,
        designOutline(sample, entry, { maxDepth: 4, maxNodes: 150 }).text,
        `\n## Existing mappings\n${existing.length ? existing.map((r) => `- ${r.name}: ${r.url}`).join("\n") : "(none)"}`,
      ]

        .filter((s) => s !== "")

        .join("\n"),
    );
  },
});
