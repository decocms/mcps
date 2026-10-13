/**
 * Turns Figma REST nodes into compact, code-oriented text.
 *
 * Raw node JSON is megabytes of vector geometry and editor state; agents need
 * the part that becomes code: hierarchy, auto-layout as flexbox, sizes, colors,
 * type, radii, shadows, component props and the text itself. One line per
 * layer keeps a full section inside a few thousand tokens.
 */

import type {
  ComponentMeta,
  ComponentSetMeta,
  FigmaNode,
  StyleMeta,
} from "./figma.ts";

type Color = { r: number; g: number; b: number; a?: number };
// biome-ignore lint/suspicious/noExplicitAny: REST paint/effect payloads
type Paint = {
  type: string;
  visible?: boolean;
  opacity?: number;
  [k: string]: any;
};

const VECTOR_TYPES = new Set([
  "VECTOR",
  "BOOLEAN_OPERATION",
  "STAR",
  "LINE",
  "ELLIPSE",
  "REGULAR_POLYGON",
]);
const CONTAINER_TYPES = new Set([
  "FRAME",
  "COMPONENT",
  "COMPONENT_SET",
  "INSTANCE",
  "SECTION",
  "GROUP",
]);

const round = (n: number) => Math.round(n * 100) / 100;
const px = (n: number) => `${round(n)}px`;

export function color(c: Color, opacity = 1): string {
  const a = round((c.a ?? 1) * opacity);
  const [r, g, b] = [c.r, c.g, c.b].map((v) => Math.round(v * 255));
  if (a >= 1) {
    return `#${[r, g, b]

      .map((v) => v.toString(16).padStart(2, "0"))

      .join("")

      .toUpperCase()}`;
  }
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

const visible = (p: { visible?: boolean; [k: string]: unknown }) =>
  p.visible !== false;

function gradient(p: Paint): string {
  const stops = (p.gradientStops ?? [])

    .map(
      (s: { color: Color; position: number }) =>
        `${color(s.color, p.opacity ?? 1)} ${round(s.position * 100)}%`,
    )

    .join(", ");
  if (p.type === "GRADIENT_LINEAR" && p.gradientHandlePositions?.length >= 2) {
    const [a, b] = p.gradientHandlePositions;
    // CSS 0deg points up and grows clockwise; handles are in box space, y down.
    const deg =
      Math.round((Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI + 360) %
      360;
    return `linear-gradient(${deg}deg, ${stops})`;
  }
  if (p.type === "GRADIENT_ANGULAR") return `conic-gradient(${stops})`;
  return `radial-gradient(${stops})`;
}

/** One CSS value per visible paint, in CSS order (topmost first). */
export function paints(list: Paint[] | undefined): string[] {
  return (list ?? [])

    .filter(visible)

    .map((p) => {
      if (p.type === "SOLID") return color(p.color, p.opacity ?? 1);
      if (p.type.startsWith("GRADIENT_")) return gradient(p);
      if (p.type === "IMAGE")
        return `url(figma-image:${p.imageRef}) /* ${String(p.scaleMode ?? "FILL").toLowerCase()} */`;
      return `/* ${p.type.toLowerCase()} */`;
    })

    .reverse();
}

function background(fills: Paint[] | undefined): string | undefined {
  const values = paints(fills);
  if (values.length === 0) return undefined;
  if (values.length === 1) return values[0];
  // Stack solids as flat gradients so every layer is a valid background image.
  return values

    .map((v) =>
      v.startsWith("#") || v.startsWith("rgba")
        ? `linear-gradient(${v}, ${v})`
        : v,
    )

    .join(", ");
}

function effects(node: FigmaNode, css: string[]) {
  const shadows: string[] = [];
  for (const e of (node.effects ?? []).filter(visible)) {
    if (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") {
      shadows.push(
        `${e.type === "INNER_SHADOW" ? "inset " : ""}${px(e.offset?.x ?? 0)} ${px(e.offset?.y ?? 0)} ${px(e.radius ?? 0)} ${px(e.spread ?? 0)} ${color(e.color)}`,
      );
    } else if (e.type === "LAYER_BLUR")
      css.push(`filter: blur(${px(e.radius ?? 0)})`);
    else if (e.type === "BACKGROUND_BLUR")
      css.push(`backdrop-filter: blur(${px(e.radius ?? 0)})`);
  }
  if (shadows.length) css.push(`box-shadow: ${shadows.join(", ")}`);
}

function border(node: FigmaNode, css: string[]) {
  const strokes = paints(node.strokes);
  if (!strokes.length || !node.strokeWeight) return;
  const style = node.strokeDashes?.length ? "dashed" : "solid";
  const w = node.individualStrokeWeights;
  const where =
    node.strokeAlign && node.strokeAlign !== "INSIDE"
      ? ` /* stroke ${node.strokeAlign.toLowerCase()} */`
      : "";
  if (w && (w.top !== w.bottom || w.left !== w.right || w.top !== w.left)) {
    for (const side of ["top", "right", "bottom", "left"] as const) {
      if (w[side])
        css.push(`border-${side}: ${px(w[side])} ${style} ${strokes[0]}`);
    }
  } else {
    css.push(`border: ${px(node.strokeWeight)} ${style} ${strokes[0]}${where}`);
  }
}

function radius(node: FigmaNode, css: string[]) {
  const r = node.rectangleCornerRadii as number[] | undefined;
  if (r && new Set(r).size > 1)
    css.push(`border-radius: ${r.map(px).join(" ")}`);
  else if (node.cornerRadius)
    css.push(`border-radius: ${px(node.cornerRadius)}`);
}

const JUSTIFY: Record<string, string> = {
  MIN: "flex-start",
  CENTER: "center",
  MAX: "flex-end",
  SPACE_BETWEEN: "space-between",
};
const ALIGN: Record<string, string> = {
  MIN: "flex-start",
  CENTER: "center",
  MAX: "flex-end",
  BASELINE: "baseline",
};

function autoLayout(node: FigmaNode, css: string[]) {
  const mode = node.layoutMode;
  // Figma keeps a gap on single-child frames; in CSS it does nothing.
  const spaced = (node.children ?? []).filter(visible).length > 1;
  if (mode === "GRID") {
    css.push("display: grid");
    if (node.gridColumnCount)
      css.push(`grid-template-columns: repeat(${node.gridColumnCount}, 1fr)`);
    if (node.gridRowCount)
      css.push(`grid-template-rows: repeat(${node.gridRowCount}, auto)`);
    if (spaced && (node.gridRowGap || node.gridColumnGap))
      css.push(
        `gap: ${px(node.gridRowGap ?? 0)} ${px(node.gridColumnGap ?? 0)}`,
      );
  } else if (mode === "HORIZONTAL" || mode === "VERTICAL") {
    css.push("display: flex");
    if (mode === "VERTICAL") css.push("flex-direction: column");
    if (node.layoutWrap === "WRAP") css.push("flex-wrap: wrap");
    const justify = JUSTIFY[node.primaryAxisAlignItems ?? "MIN"];
    if (justify && justify !== "flex-start")
      css.push(`justify-content: ${justify}`);
    const align = ALIGN[node.counterAxisAlignItems ?? "MIN"];
    if (align && align !== "flex-start") css.push(`align-items: ${align}`);
    if (
      spaced &&
      node.itemSpacing &&
      node.primaryAxisAlignItems !== "SPACE_BETWEEN"
    ) {
      css.push(
        node.layoutWrap === "WRAP" && node.counterAxisSpacing
          ? `gap: ${px(node.counterAxisSpacing)} ${px(node.itemSpacing)}`
          : `gap: ${px(node.itemSpacing)}`,
      );
    }
  } else {
    return;
  }
  const pad = [
    node.paddingTop,
    node.paddingRight,
    node.paddingBottom,
    node.paddingLeft,
  ].map((v) => v ?? 0);
  if (pad.some(Boolean)) {
    const [t, r, b, l] = pad;
    css.push(
      `padding: ${t === b && r === l ? (t === r ? px(t) : `${px(t)} ${px(r)}`) : pad.map(px).join(" ")}`,
    );
  }
}

/** Sizing relative to the parent: fixed px, hug (omitted) or fill. */
function sizing(node: FigmaNode, parent: FigmaNode | undefined, css: string[]) {
  const box = node.absoluteBoundingBox;
  const parentFlex =
    parent &&
    (parent.layoutMode === "HORIZONTAL" || parent.layoutMode === "VERTICAL");
  const absolute =
    node.layoutPositioning === "ABSOLUTE" ||
    (parent && !parentFlex && parent.layoutMode !== "GRID");

  if (absolute && parent?.absoluteBoundingBox && box) {
    css.push(
      "position: absolute",
      `left: ${px(box.x - parent.absoluteBoundingBox.x)}`,
      `top: ${px(box.y - parent.absoluteBoundingBox.y)}`,
    );
  }
  if (!box) return;

  const axis = (dim: "Horizontal" | "Vertical") => {
    const mode = node[`layoutSizing${dim}`] as string | undefined;
    const prop = dim === "Horizontal" ? "width" : "height";
    const size = dim === "Horizontal" ? box.width : box.height;
    if (
      mode === "HUG" ||
      (node.type === "TEXT" &&
        dim === "Horizontal" &&
        node.style?.textAutoResize === "WIDTH_AND_HEIGHT")
    )
      return;
    if (mode === "FILL" && parentFlex && !absolute) {
      const main =
        (parent.layoutMode === "HORIZONTAL") === (dim === "Horizontal");
      css.push(main ? "flex: 1 0 0" : "align-self: stretch");
      return;
    }
    if (node.type === "TEXT" && dim === "Vertical") return; // text height follows content
    css.push(`${prop}: ${px(size)}`);
  };
  axis("Horizontal");
  axis("Vertical");

  for (const [k, prop] of [
    ["minWidth", "min-width"],
    ["maxWidth", "max-width"],
    ["minHeight", "min-height"],
    ["maxHeight", "max-height"],
  ] as const) {
    if (node[k] != null) css.push(`${prop}: ${px(node[k])}`);
  }
}

// biome-ignore lint/suspicious/noExplicitAny: REST TypeStyle
export function textStyle(
  style: Record<string, any> | undefined,
  fills?: Paint[],
): string[] {
  if (!style) return [];
  const css: string[] = [];
  const c = paints(fills);
  if (c.length) css.push(`color: ${c[0]}`);
  if (style.fontFamily) css.push(`font-family: "${style.fontFamily}"`);
  if (style.fontWeight) css.push(`font-weight: ${style.fontWeight}`);
  if (style.fontSize) css.push(`font-size: ${px(style.fontSize)}`);
  if (style.italic) css.push("font-style: italic");
  if (style.lineHeightUnit === "PIXELS" && style.lineHeightPx)
    css.push(`line-height: ${px(style.lineHeightPx)}`);
  else if (
    style.lineHeightUnit === "FONT_SIZE_%" &&
    style.lineHeightPercentFontSize
  )
    css.push(`line-height: ${round(style.lineHeightPercentFontSize / 100)}`);
  if (style.letterSpacing)
    css.push(`letter-spacing: ${px(style.letterSpacing)}`);
  // Figma "vertical trim": the box is cut to cap height, hence the small height.
  if (style.leadingTrim === "CAP_HEIGHT")
    css.push("text-box: trim-both cap alphabetic");
  const align = { CENTER: "center", RIGHT: "right", JUSTIFIED: "justify" }[
    style.textAlignHorizontal as string
  ];
  if (align) css.push(`text-align: ${align}`);
  const transform = {
    UPPER: "uppercase",
    LOWER: "lowercase",
    TITLE: "capitalize",
  }[style.textCase as string];
  if (transform) css.push(`text-transform: ${transform}`);
  if (style.textCase === "SMALL_CAPS" || style.textCase === "SMALL_CAPS_FORCED")
    css.push("font-variant: small-caps");
  const deco = { UNDERLINE: "underline", STRIKETHROUGH: "line-through" }[
    style.textDecoration as string
  ];
  if (deco) css.push(`text-decoration: ${deco}`);
  return css;
}

/** Text runs with their own style, when a text layer mixes styles. */
function textRuns(node: FigmaNode): string | undefined {
  const overrides = node.characterStyleOverrides as number[] | undefined;
  const table = node.styleOverrideTable as
    | Record<string, { fills?: Paint[] } & Record<string, unknown>>
    | undefined;
  if (!overrides?.length || !table) return undefined;
  const chars: string = node.characters ?? "";
  const runs: string[] = [];
  let start = 0;
  for (let i = 1; i <= chars.length; i++) {
    if (i === chars.length || (overrides[i] ?? 0) !== (overrides[start] ?? 0)) {
      const id = overrides[start] ?? 0;
      if (id && table[id]) {
        const css = textStyle(table[id], table[id].fills);
        if (css.length)
          runs.push(`"${chars.slice(start, i)}" { ${css.join("; ")} }`);
      }
      start = i;
    }
  }
  return runs.length ? runs.join(" ") : undefined;
}

/** Absolute children need this node as their containing block. */
function hasAbsoluteChild(node: FigmaNode): boolean {
  const kids = (node.children ?? []).filter(visible);
  if (!kids.length || !CONTAINER_TYPES.has(node.type)) return false;
  const flow =
    node.layoutMode === "HORIZONTAL" ||
    node.layoutMode === "VERTICAL" ||
    node.layoutMode === "GRID";
  return (
    !flow || kids.some((k: FigmaNode) => k.layoutPositioning === "ABSOLUTE")
  );
}

export function nodeCss(node: FigmaNode, parent?: FigmaNode): string[] {
  const css: string[] = [];
  sizing(node, parent, css);
  if (!css.includes("position: absolute") && hasAbsoluteChild(node))
    css.push("position: relative");
  if (node.type === "TEXT") {
    css.push(...textStyle(node.style, node.fills));
  } else if (node.type === "LINE") {
    // A divider: a border, not an SVG to export.
    const stroke = paints(node.strokes)[0];
    if (stroke)
      css.push(
        `border-top: ${px(node.strokeWeight ?? 1)} ${node.strokeDashes?.length ? "dashed" : "solid"} ${stroke}`,
      );
  } else if (!VECTOR_TYPES.has(node.type)) {
    autoLayout(node, css);
    const bg = background(node.fills);
    if (bg) css.push(`background: ${bg}`);
    border(node, css);
    radius(node, css);
    if (node.clipsContent && CONTAINER_TYPES.has(node.type))
      css.push("overflow: hidden");
  } else {
    const fill = paints(node.fills)[0];
    if (fill) css.push(`color: ${fill}`);
  }
  effects(node, css);
  if (node.opacity != null && node.opacity < 1)
    css.push(`opacity: ${round(node.opacity)}`);
  return css;
}

/** True when every visible leaf is vector geometry — an icon or illustration. */
export function isVectorOnly(node: FigmaNode): boolean {
  if (VECTOR_TYPES.has(node.type)) return true;
  if (node.type === "TEXT") return false;
  const kids = (node.children ?? []).filter(visible);
  return kids.length > 0 && kids.every(isVectorOnly);
}

const cleanProp = (name: string) => name.replace(/#\d+:\d+$/, "");

export interface ContextAssets {
  components?: Record<string, ComponentMeta>;
  componentSets?: Record<string, ComponentSetMeta>;
  styles?: Record<string, StyleMeta>;
}

export interface OutlineResult {
  text: string;
  nodeCount: number;
  truncated: boolean;
  boundVariables: number;
  imageRefs: Set<string>;
  /** "Family weight" pairs used by text, for checking the project loads them. */
  fonts: Set<string>;
}

/**
 * Renders a node tree as one line per layer:
 *   TYPE "name" [id] W×H <Component Prop=Value> styles{…} asset=svg { css } "text"
 */
export function designOutline(
  root: FigmaNode,
  assets: ContextAssets,
  opts: { maxNodes?: number; maxDepth?: number } = {},
): OutlineResult {
  const maxNodes = opts.maxNodes ?? 800;
  const lines: string[] = [];
  const imageRefs = new Set<string>();
  const fonts = new Set<string>();
  let nodeCount = 0;
  let truncated = false;
  let boundVariables = 0;

  const visit = (
    node: FigmaNode,
    parent: FigmaNode | undefined,
    depth: number,
  ) => {
    if (!visible(node)) return;
    if (nodeCount >= maxNodes) {
      truncated = true;
      return;
    }
    nodeCount++;
    const box = node.absoluteBoundingBox;
    // Text layers are identified by their content; their names are often stale.
    const parts = [
      node.type === "TEXT"
        ? `${"  ".repeat(depth)}TEXT [${node.id}]`
        : `${"  ".repeat(depth)}${node.type} "${node.name}" [${node.id}]`,
    ];
    if (box) parts.push(`${round(box.width)}×${round(box.height)}`);

    if (node.type === "INSTANCE" && node.componentId) {
      const comp = assets.components?.[node.componentId];
      const set = comp?.componentSetId
        ? assets.componentSets?.[comp.componentSetId]
        : undefined;
      const props = Object.entries(node.componentProperties ?? {})

        .map(
          ([k, v]) =>
            `${cleanProp(k)}=${JSON.stringify((v as { value: unknown }).value)}`,
        )

        .join(" ");
      parts.push(
        `<${set?.name ?? comp?.name ?? node.componentId}${props ? ` ${props}` : ""}>`,
      );
    }
    if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
      const defs = Object.entries(node.componentPropertyDefinitions ?? {})

        .map(([k, v]) => {
          const d = v as { type: string; variantOptions?: string[] };
          return `${cleanProp(k)}:${d.variantOptions ? d.variantOptions.join("|") : d.type.toLowerCase()}`;
        })

        .join(" ");
      if (defs) parts.push(`props{${defs}}`);
    }

    const styleNames = Object.entries(node.styles ?? {})

      .map(
        ([kind, id]) =>
          `${kind}:"${assets.styles?.[id as string]?.name ?? id}"`,
      )

      .join(" ");
    if (styleNames) parts.push(`styles{${styleNames}}`);
    if (node.boundVariables && Object.keys(node.boundVariables).length)
      boundVariables++;

    const vectorOnly = node.type !== "LINE" && isVectorOnly(node);
    if (vectorOnly) parts.push("asset=svg");
    for (const p of (node.fills ?? []).filter(visible)) {
      if (p.type === "IMAGE" && p.imageRef) {
        imageRefs.add(p.imageRef);
        parts.push(`asset=image(${p.imageRef})`);
      }
    }

    const css = nodeCss(node, parent);
    if (css.length) parts.push(`{ ${css.join("; ")} }`);
    if (node.type === "TEXT") {
      const chars = String(node.characters ?? "");
      parts.push(
        JSON.stringify(chars.length > 500 ? `${chars.slice(0, 500)}…` : chars),
      );
      const runs = textRuns(node);
      if (runs) parts.push(`runs: ${runs}`);
      // The base style counts only if some character still uses it.
      const overrides = (node.characterStyleOverrides ?? []) as number[];
      const baseUsed =
        overrides.length < chars.length || overrides.some((o) => !o);
      const styles = [
        ...(baseUsed ? [node.style] : []),
        ...Object.values(
          (node.styleOverrideTable ?? {}) as Record<string, typeof node.style>,
        ),
      ];
      for (const st of styles) {
        if (st?.fontFamily)
          fonts.add(`${st.fontFamily} ${st.fontWeight ?? 400}`);
      }
    }
    lines.push(parts.join(" "));

    if (vectorOnly) return; // geometry is not code; export it as SVG instead
    if (opts.maxDepth !== undefined && depth >= opts.maxDepth) {
      const hidden = (node.children ?? []).filter(visible).length;
      if (hidden)
        lines.push(
          `${"  ".repeat(depth + 1)}… ${hidden} children (raise maxDepth or query [${node.id}])`,
        );
      return;
    }
    for (const child of node.children ?? []) visit(child, node, depth + 1);
  };

  visit(root, undefined, 0);
  if (truncated)
    lines.push(
      `… truncated at ${maxNodes} layers; query a child node id for the rest.`,
    );
  return {
    text: lines.join("\n"),
    nodeCount,
    truncated,
    boundVariables,
    imageRefs,
    fonts,
  };
}

const xmlEscape = (s: string) =>
  s

    .replaceAll("&", "&amp;")

    .replaceAll('"', "&quot;")

    .replaceAll("<", "&lt;")

    .replaceAll(">", "&gt;");

/** Sparse XML outline: ids, names, types, positions and sizes only. */
export function metadataXml(
  root: FigmaNode,
  opts: { maxDepth?: number; origin?: { x: number; y: number } } = {},
): string {
  const out: string[] = [];
  const origin = opts.origin ?? root.absoluteBoundingBox ?? { x: 0, y: 0 };
  const visit = (n: FigmaNode, depth: number) => {
    if (!visible(n)) return;
    const box = n.absoluteBoundingBox;
    const attrs = [`id="${n.id}"`, `name="${xmlEscape(n.name)}"`];
    if (box) {
      attrs.push(
        `x="${round(box.x - origin.x)}"`,
        `y="${round(box.y - origin.y)}"`,
        `width="${round(box.width)}"`,
        `height="${round(box.height)}"`,
      );
    }
    const tag = n.type.toLowerCase().replaceAll("_", "-");
    const kids = (n.children ?? []).filter(visible);
    const pad = "  ".repeat(depth);
    if (
      !kids.length ||
      (opts.maxDepth !== undefined && depth >= opts.maxDepth)
    ) {
      out.push(
        `${pad}<${tag} ${attrs.join(" ")}${kids.length ? ` children="${kids.length}"` : ""} />`,
      );
      return;
    }
    out.push(`${pad}<${tag} ${attrs.join(" ")}>`);
    for (const k of kids) visit(k, depth + 1);
    out.push(`${pad}</${tag}>`);
  };
  visit(root, 0);
  return out.join("\n");
}

/** FigJam boards as XML: stickies, shapes, sections, text and connectors. */
export function figjamXml(root: FigmaNode): string {
  const names = new Map<string, string>();
  const out: string[] = [];
  const visit = (n: FigmaNode, depth: number) => {
    names.set(n.id, n.name);
    const attrs = [`id="${n.id}"`];
    if (n.name && n.type !== "STICKY" && n.type !== "CONNECTOR")
      attrs.push(`name="${xmlEscape(n.name)}"`);
    if (n.shapeType) attrs.push(`shape="${n.shapeType.toLowerCase()}"`);
    const fill = paints(n.fills)[0];
    if (
      fill &&
      (n.type === "STICKY" ||
        n.type === "SHAPE_WITH_TEXT" ||
        n.type === "SECTION")
    )
      attrs.push(`color="${fill}"`);
    if (n.type === "CONNECTOR") {
      if (n.connectorStart?.endpointNodeId)
        attrs.push(`from="${n.connectorStart.endpointNodeId}"`);
      if (n.connectorEnd?.endpointNodeId)
        attrs.push(`to="${n.connectorEnd.endpointNodeId}"`);
    }
    const text = n.characters ?? n.text?.characters;
    const tag = n.type.toLowerCase().replaceAll("_", "-");
    const pad = "  ".repeat(depth);
    const kids = (n.children ?? []).filter(visible);
    if (!kids.length) {
      out.push(
        text
          ? `${pad}<${tag} ${attrs.join(" ")}>${xmlEscape(String(text))}</${tag}>`
          : `${pad}<${tag} ${attrs.join(" ")} />`,
      );
      return;
    }
    out.push(`${pad}<${tag} ${attrs.join(" ")}>`);
    if (text) out.push(`${pad}  <text>${xmlEscape(String(text))}</text>`);
    for (const k of kids) visit(k, depth + 1);
    out.push(`${pad}</${tag}>`);
  };
  visit(root, 0);
  // Name connector endpoints so edges read without a second lookup.
  return out

    .join("\n")

    .replace(/(from|to)="([^"]+)"/g, (m, k, id) =>
      names.has(id)
        ? `${k}="${id}" ${k}-name="${xmlEscape(names.get(id)!)}"`
        : m,
    );
}

/** Prototype interactions and transitions for a subtree. */
export function motion(root: FigmaNode, recursive: boolean) {
  const names = new Map<string, string>();
  const found: Array<Record<string, unknown>> = [];
  const visit = (n: FigmaNode, depth: number) => {
    names.set(n.id, n.name);
    for (const it of n.interactions ?? []) {
      for (const action of it.actions ?? []) {
        if (!action) continue;
        const t = action.transition;
        const easing = t?.easing;
        const bezier = easing?.easingFunctionCubicBezier;
        found.push({
          nodeId: n.id,
          node: n.name,
          trigger: it.trigger?.type,
          ...(it.trigger?.timeout
            ? { delayMs: Math.round(it.trigger.timeout * 1000) }
            : {}),
          action: action.navigation ?? action.type,
          destinationId: action.destinationId,
          ...(t
            ? {
                transition: t.type,
                durationMs:
                  t.duration != null
                    ? Math.round(t.duration * 1000)
                    : undefined,
                easing: bezier
                  ? `cubic-bezier(${bezier.x1}, ${bezier.y1}, ${bezier.x2}, ${bezier.y2})`
                  : easing?.type?.toLowerCase().replaceAll("_", "-"),
                direction: t.direction,
              }
            : {}),
        });
      }
    }
    if (recursive) for (const c of n.children ?? []) visit(c, depth + 1);
  };
  visit(root, 0);
  for (const f of found) {
    const dest = f.destinationId as string | undefined;
    if (dest && names.has(dest)) f.destination = names.get(dest);
  }
  return found;
}
