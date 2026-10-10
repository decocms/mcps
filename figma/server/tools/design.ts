/**
 * Design-to-code tools, named after Figma's official MCP server so prompts and
 * skills written for it carry over.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { commentsFor, formatComments, listComments } from "../lib/comments.ts";
import {
  color,
  designOutline,
  figjamXml,
  metadataXml,
  motion,
  paints,
  textStyle,
} from "../lib/design.ts";
import {
  downloadBase64,
  type FigmaNode,
  figmaFetch,
  fitScale,
  getFileShallow,
  getNode,
  mapLimit,
  parseFigmaRef,
  renderImages,
  tokenFrom,
  walk,
} from "../lib/figma.ts";
import { fileKeySchema, nodeIdSchema, text } from "./shared.ts";

async function screenshot(
  token: string,
  fileKey: string,
  node: FigmaNode,
  format: "png" | "jpg",
  scale?: number,
) {
  const box = node.absoluteBoundingBox ?? { width: 1000, height: 1000 };
  const s = fitScale(box.width, box.height, scale);
  const urls = await renderImages(token, fileKey, [node.id], {
    format,
    scale: s,
  });
  const url = urls[node.id];
  if (!url)
    throw new Error(
      `Figma returned no render for ${node.id} (empty or invisible node?)`,
    );
  return { ...(await downloadBase64(url)), scale: s };
}

export const getDesignContextTool = createPrivateTool({
  id: "get_design_context",
  description:
    "START HERE for any Figma link in a task. Returns, in one call, a screenshot of the node plus a code-oriented layer outline: " +
    "hierarchy, auto-layout as flexbox CSS (gap, padding, alignment, fill/hug sizing), exact sizes, colors, typography, radii, shadows, " +
    "component instances with their props, style names, real text content, and the design comments pinned to the node. " +
    "Comments are part of the spec — read them. Layers marked asset=svg are icons/illustrations: export them with download_assets " +
    "instead of rebuilding geometry. Map the CSS onto the project's own components and tokens rather than pasting it verbatim. " +
    "For large frames, call get_metadata first and then this tool on the child sections.",
  inputSchema: z.object({
    fileKey: fileKeySchema,
    nodeId: nodeIdSchema,
    clientFrameworks: z
      .string()
      .optional()
      .describe('Target frameworks, e.g. "react,next" — echoed as guidance.'),
    clientLanguages: z
      .string()
      .optional()
      .describe('Target languages, e.g. "typescript,css".'),
    includeScreenshot: z
      .boolean()
      .default(true)
      .describe("Attach a PNG of the node (recommended)."),
    includeComments: z
      .boolean()
      .default(true)
      .describe("Include unresolved comments pinned inside the node."),
    maxDepth: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Stop descending after this depth (default: full tree)."),
    maxNodes: z
      .number()
      .int()
      .min(10)
      .max(5000)
      .default(800)
      .describe("Layer budget before truncating."),
  }),
  execute: async ({ context, runtimeContext }) => {
    const token = tokenFrom(runtimeContext);
    const ref = parseFigmaRef(context.fileKey, context.nodeId);
    if (!ref.nodeId) {
      const file = await getFileShallow(token, ref.fileKey, 2);
      return text(
        `No node selected. "${file.name}" has these pages and top-level frames — call again with one of their ids:\n\n${metadataXml(file.document, { maxDepth: 2, origin: { x: 0, y: 0 } })}`,
      );
    }

    const [node, comments] = await Promise.all([
      getNode(token, ref),
      context.includeComments
        ? listComments(token, ref.fileKey).catch((e: Error) => e)
        : Promise.resolve(null),
    ]);
    const outline = designOutline(node.document, node, {
      maxDepth: context.maxDepth,
      maxNodes: context.maxNodes,
    });

    const content: Array<
      | { type: "text"; text: string }
      | { type: "image"; data: string; mimeType: string }
    > = [];
    const notes: string[] = [];
    if (context.includeScreenshot) {
      try {
        const shot = await screenshot(token, ref.fileKey, node.document, "png");
        content.push({
          type: "image",
          data: shot.data,
          mimeType: shot.mimeType,
        });
        notes.push(
          `Screenshot rendered at scale ${shot.scale} (1 design px = ${shot.scale} image px).`,
        );
      } catch (e) {
        notes.push(`Screenshot unavailable: ${(e as Error).message}`);
      }
    }

    const box = node.document.absoluteBoundingBox;
    const sections = [
      `# ${node.document.type} "${node.document.name}" [${node.document.id}] in "${node.file.name}" (edited ${node.file.lastModified.slice(0, 10)})`,
      box
        ? `Frame size: ${Math.round(box.width)}×${Math.round(box.height)}px — implement at this viewport width.`
        : "",
      context.clientFrameworks || context.clientLanguages
        ? `Target stack: ${[context.clientFrameworks, context.clientLanguages].filter(Boolean).join(" / ")}. Translate the CSS below into that stack's idioms and the repo's existing components/tokens.`
        : "",
      'Format: TYPE "name" [id] W×H <Component Prop=Value> styles{…} asset=… { css } "text". Children are indented under their parent.',
      "",
      outline.text,
    ];

    if (comments instanceof Error)
      notes.push(`Comments unavailable: ${comments.message}`);
    else if (comments) {
      const mine = commentsFor(comments, node.document);
      if (mine.length)
        sections.push(
          "",
          `## Design comments (${mine.filter((c) => !c.parent_id).length} threads) — treat as spec`,
          formatComments(mine, node.document),
        );
    }
    if (outline.imageRefs.size)
      notes.push(
        `${outline.imageRefs.size} image fill(s): pass their refs to download_assets (imageRefs) for the original files.`,
      );
    if (outline.boundVariables)
      notes.push(
        `${outline.boundVariables} layer(s) use Figma variables: call get_variable_defs for token names.`,
      );
    if (notes.length)
      sections.push("", "## Notes", ...notes.map((n) => `- ${n}`));

    content.push({
      type: "text",
      text: sections
        .filter((s, i, a) => s !== "" || a[i - 1] !== "")
        .join("\n"),
    });
    return { content };
  },
});

export const getMetadataTool = createPrivateTool({
  id: "get_metadata",
  description:
    "Sparse XML outline of a node (or of every page and top-level frame when no node is given): layer ids, names, types, positions and sizes, " +
    "no styling. Cheap way to map a large page and pick the child sections to pass to get_design_context.",
  inputSchema: z.object({
    fileKey: fileKeySchema,
    nodeId: nodeIdSchema,
    maxDepth: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        "Limit depth (default: full subtree for a node, 2 for a whole file).",
      ),
  }),
  execute: async ({ context, runtimeContext }) => {
    const token = tokenFrom(runtimeContext);
    const ref = parseFigmaRef(context.fileKey, context.nodeId);
    if (!ref.nodeId) {
      const depth = context.maxDepth ?? 2;
      const file = await getFileShallow(token, ref.fileKey, depth);
      return text(
        metadataXml(file.document, { maxDepth: depth, origin: { x: 0, y: 0 } }),
      );
    }
    const node = await getNode(token, ref, context.maxDepth);
    return text(metadataXml(node.document, { maxDepth: context.maxDepth }));
  },
});

export const getScreenshotTool = createPrivateTool({
  id: "get_screenshot",
  description:
    "Render a node as an image. Use it to compare an implementation against the design at the frame's own viewport. " +
    "Without scale the render is fitted to ~1600px wide (costs one extra metadata call to read the size).",
  inputSchema: z.object({
    fileKey: fileKeySchema,
    nodeId: nodeIdSchema,
    format: z.enum(["png", "jpg"]).default("png"),
    scale: z
      .number()
      .min(0.01)
      .max(4)
      .optional()
      .describe("Render scale; omit to auto-fit."),
  }),
  execute: async ({ context, runtimeContext }) => {
    const token = tokenFrom(runtimeContext);
    const ref = parseFigmaRef(context.fileKey, context.nodeId);
    if (!ref.nodeId)
      throw new Error(
        "get_screenshot needs a node: pass a link with ?node-id=… or nodeId.",
      );
    const node: FigmaNode =
      context.scale !== undefined
        ? { id: ref.nodeId, name: "", type: "", absoluteBoundingBox: undefined }
        : (await getNode(token, ref, 1)).document;
    const shot = await screenshot(
      token,
      ref.fileKey,
      node,
      context.format,
      context.scale,
    );
    return {
      content: [
        { type: "image" as const, data: shot.data, mimeType: shot.mimeType },
        {
          type: "text" as const,
          text: `Rendered ${ref.nodeId} at scale ${shot.scale}.`,
        },
      ],
    };
  },
});

export const downloadAssetsTool = createPrivateTool({
  id: "download_assets",
  description:
    "Export layers as PNG/JPG/SVG/PDF (icons and illustrations marked asset=svg, logos, product shots) and fetch the original files " +
    "behind image fills (refs shown as asset=image(ref) in get_design_context). Returns temporary Figma URLs (valid ~30 days); " +
    "with enableBase64Response the files come inline (SVG as markup text). Save assets into the repo's existing asset pipeline.",
  inputSchema: z.object({
    fileKey: fileKeySchema,
    nodeIds: z
      .array(z.string())
      .max(50)
      .default([])
      .describe("Layers to export."),
    imageRefs: z
      .array(z.string())
      .max(50)
      .default([])
      .describe("Image-fill refs whose original source file you want."),
    defaultFormat: z.enum(["png", "jpg", "svg", "pdf"]).default("svg"),
    defaultScale: z
      .number()
      .min(0.01)
      .max(4)
      .default(2)
      .describe("Raster scale (ignored for svg/pdf)."),
    enableBase64Response: z
      .boolean()
      .default(false)
      .describe("Inline the files (max 10) instead of returning URLs."),
  }),
  execute: async ({ context, runtimeContext }) => {
    const token = tokenFrom(runtimeContext);
    const ref = parseFigmaRef(context.fileKey);
    const ids = [
      ...new Set(
        context.nodeIds.map((id) => parseFigmaRef(ref.fileKey, id).nodeId!),
      ),
    ];
    if (!ids.length && !context.imageRefs.length) {
      const urlNode = parseFigmaRef(context.fileKey).nodeId;
      if (urlNode) ids.push(urlNode);
      else throw new Error("Pass nodeIds and/or imageRefs.");
    }

    const [renders, fills] = await Promise.all([
      ids.length
        ? renderImages(token, ref.fileKey, ids, {
            format: context.defaultFormat,
            scale: context.defaultScale,
          })
        : {},
      context.imageRefs.length
        ? figmaFetch<{ meta: { images: Record<string, string> } }>(
            token,
            `/v1/files/${ref.fileKey}/images`,
          ).then((r) => r.meta.images)
        : ({} as Record<string, string>),
    ]);

    const assets = [
      ...ids.map((id) => ({
        kind: "node",
        id,
        format: context.defaultFormat,
        url: (renders as Record<string, string | null>)[id] ?? null,
      })),
      ...context.imageRefs.map((r) => ({
        kind: "imageFill",
        id: r,
        format: "original",
        url: fills[r] ?? null,
      })),
    ];

    if (!context.enableBase64Response) return { assets };
    if (assets.length > 10)
      throw new Error(
        "enableBase64Response supports up to 10 assets per call.",
      );

    const content: Array<
      | { type: "text"; text: string }
      | { type: "image"; data: string; mimeType: string }
    > = [];
    await mapLimit(assets, 4, async (a) => {
      if (!a.url) {
        content.push({
          type: "text",
          text: `${a.kind} ${a.id}: no file returned.`,
        });
        return;
      }
      const file = await downloadBase64(a.url);
      if (file.mimeType.includes("svg")) {
        content.push({
          type: "text",
          text: `${a.kind} ${a.id} (svg):\n${Buffer.from(file.data, "base64").toString("utf8")}`,
        });
      } else if (file.mimeType.startsWith("image/")) {
        content.push(
          { type: "text", text: `${a.kind} ${a.id} (${file.mimeType}):` },
          { type: "image", ...file },
        );
      } else {
        content.push({
          type: "text",
          text: `${a.kind} ${a.id}: ${file.mimeType} cannot be inlined, download it from ${a.url}`,
        });
      }
    });
    return { content };
  },
});

type Alias = { type?: string; id: string };
const PAINT_PROPS = new Set(["fills", "strokes"]);

export const getVariableDefsTool = createPrivateTool({
  id: "get_variable_defs",
  description:
    "Design tokens used inside a node: style names (color, text, effect) with their values, and bound variables with their resolved values. " +
    "Variable names need a Figma Enterprise plan (REST limitation); without it variables come back by id with the value they resolve to here. " +
    "Map these onto the project's existing tokens instead of hardcoding values.",
  inputSchema: z.object({ fileKey: fileKeySchema, nodeId: nodeIdSchema }),
  execute: async ({ context, runtimeContext }) => {
    const token = tokenFrom(runtimeContext);
    const ref = parseFigmaRef(context.fileKey, context.nodeId);
    const node = await getNode(token, ref);

    const styles: Record<string, string> = {};
    const variables = new Map<string, { property: string; value: unknown }>();

    walk(node.document, (n) => {
      if (n.visible === false) return false;
      for (const [kind, id] of Object.entries(
        (n.styles ?? {}) as Record<string, string>,
      )) {
        const name = node.styles[id]?.name ?? id;
        if (styles[name]) continue;
        const key = kind.toLowerCase();
        if (key.startsWith("fill") || key.startsWith("stroke")) {
          styles[name] = paints(
            key.startsWith("fill") ? n.fills : n.strokes,
          ).join(", ");
        } else if (key === "text") {
          styles[name] = textStyle(n.style).join("; ");
        } else if (key === "effect") {
          styles[name] = (n.effects ?? [])

            .map(
              (e: {
                type: string;
                offset?: { x: number; y: number };
                radius?: number;
                color?: { r: number; g: number; b: number; a?: number };
              }) =>
                e.color
                  ? `${e.type} ${e.offset?.x ?? 0}px ${e.offset?.y ?? 0}px ${e.radius ?? 0}px ${color(e.color)}`
                  : `${e.type} ${e.radius ?? 0}px`,
            )

            .join(", ");
        } else {
          styles[name] = kind;
        }
      }
      for (const [prop, binding] of Object.entries(
        (n.boundVariables ?? {}) as Record<
          string,
          Alias | Alias[] | Record<string, Alias>
        >,
      )) {
        const list: Alias[] = Array.isArray(binding)
          ? binding
          : "id" in binding
            ? [binding as Alias]
            : Object.values(binding as Record<string, Alias>);
        list.forEach((alias, i) => {
          if (!alias?.id || variables.has(alias.id)) return;
          const value = PAINT_PROPS.has(prop)
            ? paints([(n[prop] ?? [])[i]].filter(Boolean))[0]
            : n[prop];
          variables.set(alias.id, { property: prop, value });
        });
      }
    });

    let named: Record<string, unknown> | undefined;
    let note: string | undefined;
    if (variables.size) {
      try {
        const local = await figmaFetch<{
          meta: {
            variables: Record<
              string,
              {
                name: string;
                resolvedType: string;
                valuesByMode: Record<string, unknown>;
                variableCollectionId: string;
              }
            >;
            variableCollections: Record<
              string,
              { name: string; modes: Array<{ modeId: string; name: string }> }
            >;
          };
        }>(token, `/v1/files/${ref.fileKey}/variables/local`);
        named = {};
        for (const [id, seen] of variables) {
          const v = local.meta.variables[id];
          if (!v) {
            named[id] = seen.value;
            continue;
          }
          const col = local.meta.variableCollections[v.variableCollectionId];
          const byMode = Object.fromEntries(
            (col?.modes ?? []).map((m) => {
              const raw = v.valuesByMode[m.modeId] as
                | { r?: number; type?: string; id?: string }
                | undefined;
              const val =
                raw && typeof raw === "object" && "r" in raw
                  ? color(
                      raw as { r: number; g: number; b: number; a?: number },
                    )
                  : raw &&
                      typeof raw === "object" &&
                      raw.type === "VARIABLE_ALIAS"
                    ? `{${local.meta.variables[raw.id!]?.name ?? raw.id}}`
                    : raw;
              return [m.name, val];
            }),
          );
          named[`${col?.name ? `${col.name}/` : ""}${v.name}`] =
            Object.keys(byMode).length === 1
              ? Object.values(byMode)[0]
              : byMode;
        }
      } catch (e) {
        note = `Variable names unavailable (${(e as Error).message.slice(0, 120)}). Listed by id with the value resolved on this node.`;
      }
    }

    return {
      styles,
      variables:
        named ??
        Object.fromEntries([...variables].map(([id, v]) => [id, v.value])),
      ...(note ? { note } : {}),
    };
  },
});

export const getMotionContextTool = createPrivateTool({
  id: "get_motion_context",
  description:
    "Prototype interactions inside a node — triggers (hover, click, after-delay), actions (navigate, change-to variant, overlay, scroll) " +
    "and their transitions (type, duration in ms, easing as CSS). Use it for hover/pressed states and carousels/overlays timing. " +
    "Keyframe timeline animations are not exposed by the Figma REST API.",
  inputSchema: z.object({
    fileKey: fileKeySchema,
    nodeId: nodeIdSchema,
    recursive: z
      .boolean()
      .default(true)
      .describe("Include descendants' interactions."),
  }),
  execute: async ({ context, runtimeContext }) => {
    const token = tokenFrom(runtimeContext);
    const node = await getNode(
      token,
      parseFigmaRef(context.fileKey, context.nodeId),
    );
    const interactions = motion(node.document, context.recursive);
    return {
      node: node.document.name,
      interactions,
      ...(interactions.length
        ? {}
        : { note: "No prototype interactions in this node." }),
    };
  },
});

export const getFigjamTool = createPrivateTool({
  id: "get_figjam",
  description:
    "Read a FigJam board (or one section of it) as XML: stickies, shapes with text, sections, text and connectors (with from/to names). " +
    "Use for flows, briefs and diagrams drawn in FigJam.",
  inputSchema: z.object({ fileKey: fileKeySchema, nodeId: nodeIdSchema }),
  execute: async ({ context, runtimeContext }) => {
    const token = tokenFrom(runtimeContext);
    const ref = parseFigmaRef(context.fileKey, context.nodeId);
    const root = ref.nodeId
      ? (await getNode(token, ref)).document
      : (
          await figmaFetch<{ document: FigmaNode }>(
            token,
            `/v1/files/${ref.fileKey}`,
          )
        ).document;
    return text(figjamXml(root));
  },
});

export const getCommentsTool = createPrivateTool({
  id: "get_comments",
  description:
    "Design comments of a file, or only those pinned inside a node, with replies. Briefs often say the comments are part of the spec. " +
    "get_design_context already includes the node's comments; use this for the whole file or resolved threads.",
  inputSchema: z.object({
    fileKey: fileKeySchema,
    nodeId: nodeIdSchema,
    includeResolved: z.boolean().default(false),
  }),
  execute: async ({ context, runtimeContext }) => {
    const token = tokenFrom(runtimeContext);
    const ref = parseFigmaRef(context.fileKey, context.nodeId);
    const [all, node] = await Promise.all([
      listComments(token, ref.fileKey),
      ref.nodeId ? getNode(token, ref) : undefined,
    ]);
    const mine = commentsFor(all, node?.document, context.includeResolved);
    return text(
      mine.length ? formatComments(mine, node?.document) : "No comments.",
    );
  },
});
