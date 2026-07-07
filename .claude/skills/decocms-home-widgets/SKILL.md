---
name: decocms-home-widgets
description: Build responsive deco CMS home widgets (MCP-App tiles). Covers the resizable tile grid (Size picker up to 4×5), observed pixel sizes, the golden rules for filling + scrolling inside a tile, ResizeObserver-based breakpoints, and how to register a widget (tool _meta.ui.resourceUri → resource → constants → vite entry → html).
---

# deco CMS Home Widgets

MCP tools can render a small React app ("MCP-App") as a **widget/tile** on the deco
home ("What's on your mind" screen). This skill explains how the home sizes those
tiles and how to make a widget that looks right at **every** size and state.

## When to use this skill

- Building or fixing a home widget for an MCP (the small resizable cards on the home).
- A widget's content is being clipped, has no scroll, wastes space, or doesn't
  adapt when resized.
- You need to register a new widget resource.

Reference implementation: `tanstack-migrator/web/tools/widget-queue/index.tsx`
(responsive 2-column queue + suggestions with internal scroll) and
`tanstack-migrator/web/tools/widget-active/index.tsx` (compact single card).

## How the tile works (READ THIS FIRST)

The **home controls the tile size**, not the MCP. The user resizes each tile with a
grid picker ("Size", **columns × rows**, up to **4×5**). There is **no API to declare
a default size** from the MCP — assume the widget can be handed any width × height.

The home wraps your widget in a tile that is roughly:

```
div.relative.flex.h-full.w-full.flex-col.p-3        (larger tiles)
div.flex.min-h-0.w-full.flex-1.flex-col.overflow-hidden   (smaller tiles)
```

Two consequences that drive every rule below:
1. The tile is `h-full w-full` — your widget should **fill it**, not hug content.
2. The tile is **`overflow-hidden`** — anything taller than the tile is **clipped**
   (no scrollbar) unless *you* add an internal scroll region.

### Observed tile sizes (px)

| cols | width  | rows | height |
|------|--------|------|--------|
| 1    | ~282   | min  | ~166   |
| 2    | ~624   | +1   | ~192   |
| 3    | ~940   | …    | ~292   |
| 4    | ~1256  | …    | ~392, ~492 |

≈ **316px per column**, ≈ **100px per row**. Widths and heights combine freely
(e.g. 1×2, 2×2, 3×3, 4×5), so design for a **range**, not fixed dimensions.

## Golden rules

1. **Root fills the tile:** `className="flex h-full min-h-0 flex-col"`. Never rely on
   natural content height — tall content gets clipped by the tile's `overflow-hidden`.
2. **Scroll inside:** put lists in a region with `flex-1 min-h-0 overflow-y-auto`.
   `min-h-0` is required or the flex child refuses to shrink and the scroll never engages.
3. **Breakpoints via `ResizeObserver`, NOT media queries.** The tile is not the
   viewport — `@media`/`sm:` react to the window, not the tile. Measure the tile:

   ```tsx
   function useWide(ref: React.RefObject<HTMLElement | null>, px: number) {
     const [wide, setWide] = useState(false);
     useEffect(() => {
       const el = ref.current; if (!el) return;
       const ro = new ResizeObserver((es) => { for (const e of es) setWide(e.contentRect.width >= px); });
       ro.observe(el); return () => ro.disconnect();
     }, [ref, px]);
     return wide;
   }
   ```
   (Tailwind v4 `@container` queries also work if you mark the root `@container`.)
4. **Adapt columns to width.** e.g. ≥520px → two columns side by side; below →
   stack them in one scroll column. Give empty/low-value sections less room
   (`grid-cols-[0.8fr_1.2fr]`) so the useful content isn't cramped.
5. **Every state fills too:** loading / error / empty use
   `flex flex-1 items-center justify-center` so they center in the tile at any size.
6. **Avoid double padding:** the tile already applies `p-3` at larger sizes. Keep a
   single modest padding on your root; don't nest another `p-3` inside.
7. **Icons on a dark tile:** transparent/dark logos vanish on the dark background.
   Put remote favicons on a fixed light background (`bg-white object-contain p-0.5`)
   and fall back through `logo → screenshot → colored letter-avatar` (never an empty
   gray box — some icon endpoints return a blank 200 that won't fire `onError`).

## Registering a widget (decocms/mcps pattern)

Five wiring points (see `tanstack-migrator/` for a live example):

1. **Constants** — a resource URI in `server/constants.ts`:
   `export const WIDGET_QUEUE_RESOURCE_URI = "ui://<mcp>/widget-queue";`
2. **Tool** — in `server/tools/widgets.ts`, a `createTool` that returns the widget's
   data and links the UI via `_meta: { ui: { resourceUri: WIDGET_QUEUE_RESOURCE_URI } }`
   and `annotations: { readOnlyHint: true }`. Register it in `server/tools/index.ts`.
3. **Resource** — in `server/resources/index.ts`, `createMcpAppResource({ uri, name,
   description, htmlFile: "widget-queue.html" })`; add it to the `resources: [...]`
   array in `server/main.ts`.
4. **Vite entry** — add the HTML to `MCP_APP_ENTRIES` in `vite.config.ts` and to the
   `build:web` script in `package.json` (`MCP_APP_ENTRY=widget-queue … vite build`).
5. **HTML + component** — `widget-queue.html` (root div + `<script src=./web/tools/widget-queue/main.tsx>`)
   and the React component in `web/tools/widget-queue/index.tsx`, fetching data with
   `usePollingTool<T>(TOOL_ID, {}, intervalMs)` from `web/hooks/use-tool.ts`.

## Checklist before shipping a widget

- [ ] Root is `flex h-full min-h-0 flex-col` (fills the tile).
- [ ] Long lists live in `flex-1 min-h-0 overflow-y-auto` (scroll, not clip).
- [ ] Layout switches on **tile width** via `ResizeObserver`/`@container`, not media queries.
- [ ] loading / error / empty states center with `flex-1`.
- [ ] Looks right at 1×2, 2×2, 3×3, 4×5 and the minimum tile.
- [ ] No double `p-3`; icons readable on the dark background with a real fallback.
- [ ] Widget wired: constants → tool `_meta.ui` → resource → `main.ts` → vite entry → html.
