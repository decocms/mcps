import { describe, expect, test } from "bun:test";
import { commentsFor } from "./comments.ts";
import {
  color,
  designOutline,
  figjamXml,
  metadataXml,
  paints,
} from "./design.ts";
import { type FigmaNode, fitScale, parseFigmaRef } from "./figma.ts";

describe("parseFigmaRef", () => {
  test("design link with dashed node-id", () => {
    expect(
      parseFigmaRef(
        "https://www.figma.com/design/ZKhGtkiroiVE2pykoGeDRJ/NB-LIBRARY-%7C-Home--PLP?node-id=2652-13291&m=dev",
      ),
    ).toEqual({ fileKey: "ZKhGtkiroiVE2pykoGeDRJ", nodeId: "2652:13291" });
  });
  test("branch link uses the branch key; explicit node id wins", () => {
    expect(
      parseFigmaRef(
        "https://www.figma.com/design/MAIN/branch/BRANCH/Name?node-id=1-2",
        "3-4",
      ),
    ).toEqual({
      fileKey: "BRANCH",
      nodeId: "3:4",
    });
  });
  test("bare key and instance ids", () => {
    expect(parseFigmaRef("abc123", "I5-6%3B7-8")).toEqual({
      fileKey: "abc123",
      nodeId: "I5:6;7:8",
    });
  });
  test("rejects non-file links", () => {
    expect(() =>
      parseFigmaRef("https://www.figma.com/files/team/123"),
    ).toThrow();
  });
});

test("fitScale keeps renders near 1600px wide and under 7900px tall", () => {
  expect(fitScale(375, 800)).toBe(2);
  expect(fitScale(1440, 900)).toBe(1.11);
  expect(fitScale(1440, 12000)).toBe(0.66);
});

test("colors and gradients", () => {
  expect(color({ r: 1, g: 0, b: 0, a: 1 })).toBe("#FF0000");
  expect(color({ r: 0, g: 0, b: 0, a: 1 }, 0.5)).toBe("rgba(0, 0, 0, 0.5)");
  const down = paints([
    {
      type: "GRADIENT_LINEAR",
      gradientHandlePositions: [
        { x: 0.5, y: 0 },
        { x: 0.5, y: 1 },
      ],
      gradientStops: [
        { color: { r: 1, g: 1, b: 1, a: 1 }, position: 0 },
        { color: { r: 0, g: 0, b: 0, a: 1 }, position: 1 },
      ],
    },
  ]);
  expect(down[0]).toBe("linear-gradient(180deg, #FFFFFF 0%, #000000 100%)");
});

const box = (x: number, y: number, width: number, height: number) => ({
  absoluteBoundingBox: { x, y, width, height },
});

const tree: FigmaNode = {
  id: "1:1",
  name: "Card",
  type: "FRAME",
  ...box(0, 0, 320, 200),
  layoutMode: "VERTICAL",
  itemSpacing: 12,
  paddingTop: 16,
  paddingBottom: 16,
  paddingLeft: 24,
  paddingRight: 24,
  counterAxisAlignItems: "CENTER",
  fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } }],
  cornerRadius: 8,
  styles: { fill: "S:1" },
  children: [
    {
      id: "1:2",
      name: "Title",
      type: "TEXT",
      ...box(24, 16, 272, 24),
      layoutSizingHorizontal: "FILL",
      characters: "Tênis 574",
      style: {
        fontFamily: "Inter",
        fontWeight: 700,
        fontSize: 20,
        lineHeightUnit: "PIXELS",
        lineHeightPx: 24,
      },
      fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }],
    },
    {
      id: "1:3",
      name: "Icon",
      type: "FRAME",
      ...box(148, 52, 24, 24),
      layoutSizingHorizontal: "FIXED",
      layoutSizingVertical: "FIXED",
      children: [
        { id: "1:4", name: "path", type: "VECTOR", ...box(150, 54, 20, 20) },
      ],
    },
    {
      id: "1:5",
      name: "Hidden",
      type: "TEXT",
      visible: false,
      characters: "nope",
    },
    {
      id: "1:6",
      name: "Buy",
      type: "INSTANCE",
      componentId: "C:1",
      componentProperties: {
        "Label#12:3": { type: "TEXT", value: "Comprar" },
        Size: { type: "VARIANT", value: "Large" },
      },
      ...box(24, 88, 272, 48),
      layoutSizingHorizontal: "FILL",
      layoutSizingVertical: "HUG",
      children: [],
    },
  ],
};

test("designOutline renders layout, text, icons and instances", () => {
  const out = designOutline(tree, {
    components: {
      "C:1": {
        key: "k",
        name: "Size=Large",
        description: "",
        remote: true,
        componentSetId: "CS:1",
      },
    },
    componentSets: { "CS:1": { key: "ks", name: "Button", description: "" } },
    styles: {
      "S:1": {
        key: "s",
        name: "Surface/White",
        styleType: "FILL",
        remote: false,
      },
    },
  });
  const [card, title, icon, buy] = out.text.split("\n");
  expect(card).toContain(
    'FRAME "Card" [1:1] 320×200 styles{fill:"Surface/White"}',
  );
  expect(card).toContain(
    "display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 16px 24px",
  );
  expect(card).toContain("background: #FFFFFF; border-radius: 8px");
  expect(title).toContain("align-self: stretch");
  expect(title).toContain(
    'font-family: "Inter"; font-weight: 700; font-size: 20px; line-height: 24px',
  );
  expect(title).toEndWith('"Tênis 574"');
  expect(icon).toContain("asset=svg");
  expect(out.text).not.toContain("Hidden");
  expect(out.text).not.toContain('"path"'); // vector internals are not listed
  expect(buy).toContain('<Button Label="Comprar" Size="Large">');
  expect(buy).toContain("align-self: stretch");
  expect(buy).not.toContain("height:");
  expect(out.nodeCount).toBe(4);
});

test("designOutline truncates at the layer budget", () => {
  const out = designOutline(tree, {}, { maxNodes: 2 });
  expect(out.truncated).toBe(true);
  expect(out.text).toContain("truncated at 2 layers");
});

test("metadata and figjam xml", () => {
  expect(metadataXml(tree, { maxDepth: 0 })).toBe(
    '<frame id="1:1" name="Card" x="0" y="0" width="320" height="200" children="3" />',
  );
  const board: FigmaNode = {
    id: "0:1",
    name: "Board",
    type: "CANVAS",
    children: [
      { id: "2:1", name: "a", type: "STICKY", characters: "Start" },
      {
        id: "2:2",
        name: "b",
        type: "SHAPE_WITH_TEXT",
        shapeType: "DIAMOND",
        characters: "Logged in?",
      },
      {
        id: "2:3",
        name: "c",
        type: "CONNECTOR",
        connectorStart: { endpointNodeId: "2:1" },
        connectorEnd: { endpointNodeId: "2:2" },
      },
    ],
  };
  const xml = figjamXml(board);
  expect(xml).toContain('<sticky id="2:1">Start</sticky>');
  expect(xml).toContain('shape="diamond"');
  expect(xml).toContain('from="2:1" from-name="a" to="2:2" to-name="b"');
});

test("commentsFor keeps threads inside the node, with replies", () => {
  const comments = [
    {
      id: "a",
      message: "pinned inside",
      created_at: "2026-10-01",
      client_meta: { node_id: "1:2" },
    },
    { id: "b", message: "reply", parent_id: "a", created_at: "2026-10-02" },
    {
      id: "c",
      message: "other frame",
      created_at: "2026-10-01",
      client_meta: { node_id: "9:9" },
    },
    {
      id: "d",
      message: "canvas, inside box",
      created_at: "2026-10-01",
      client_meta: { x: 10, y: 10 },
    },
    {
      id: "e",
      message: "resolved",
      created_at: "2026-10-01",
      resolved_at: "2026-10-03",
      client_meta: { node_id: "1:1" },
    },
  ];
  expect(commentsFor(comments, tree).map((c) => c.id)).toEqual(["a", "b", "d"]);
  expect(commentsFor(comments, tree, true).map((c) => c.id)).toEqual([
    "a",
    "b",
    "d",
    "e",
  ]);
});

test("FILA-style frame: dividers, trimmed text, lone-child gap, absolute children, fonts", () => {
  const modal: FigmaNode = {
    id: "4012:156",
    name: "Modal",
    type: "FRAME",
    ...box(0, 0, 450, 768),
    layoutMode: "HORIZONTAL",
    itemSpacing: 30,
    children: [
      {
        id: "4012:257",
        name: "Frame 657",
        type: "FRAME",
        ...box(20, 73, 100, 100),
        layoutMode: "HORIZONTAL",
        itemSpacing: 10,
        primaryAxisAlignItems: "CENTER",
        children: [
          {
            id: "4012:999",
            name: "img",
            type: "RECTANGLE",
            ...box(20, 73, 100, 100),
          },
        ],
      },
      {
        id: "4012:175",
        name: "Line 5",
        type: "LINE",
        ...box(20, 200, 386, 0),
        layoutSizingHorizontal: "FILL",
        strokeWeight: 1,
        strokes: [
          { type: "SOLID", color: { r: 0.95, g: 0.95, b: 0.95, a: 1 } },
        ],
      },
      {
        id: "4012:299",
        name: "Tamanho: 43",
        type: "TEXT",
        ...box(40, 300, 87, 10),
        characters: "Tamanho: GG",
        style: {
          fontFamily: "Helvetica Neue LT Std",
          fontWeight: 400,
          fontSize: 14,
          leadingTrim: "CAP_HEIGHT",
        },
      },
      {
        id: "4012:309",
        name: "1. Chuteiras",
        type: "TEXT",
        ...box(40, 400, 195, 11),
        characters: "Sacola",
        style: { fontFamily: "HeadlandOne", fontWeight: 400, fontSize: 16 },
        characterStyleOverrides: [1, 1, 1, 1, 1, 1],
        styleOverrideTable: {
          1: { fontFamily: "Helvetica Neue LT Std", fontWeight: 700 },
        },
      },
      {
        id: "4012:225",
        name: "Footer",
        type: "FRAME",
        ...box(0, 618, 450, 150),
        layoutPositioning: "ABSOLUTE",
        children: [],
      },
    ],
  };
  const out = designOutline(modal, {});
  const [root, image, , line, size, cta, footer] = out.text.split("\n");
  expect(root).toContain("position: relative"); // has an absolute child
  expect(root).toContain("gap: 30px");
  expect(image).toContain("justify-content: center");
  expect(image).not.toContain("gap:"); // one child: gap is a no-op
  expect(line).not.toContain("asset=svg");
  expect(line).toContain("border-top: 1px solid #F2F2F2");
  expect(size).toStartWith("  TEXT [4012:299] 87×10");
  expect(size).not.toContain("Tamanho: 43"); // stale layer name dropped
  expect(size).toContain("text-box: trim-both cap alphabetic");
  expect(cta).toContain('"Sacola"');
  expect(footer).toContain("position: absolute; left: 0px; top: 618px");
  expect([...out.fonts].sort()).toEqual([
    "Helvetica Neue LT Std 400",
    "Helvetica Neue LT Std 700",
  ]);
});
