# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run dev          # Start API server + web build (watch mode) concurrently
bun run dev:api      # API server only (port 3001, hot reload)
bun run dev:web      # Web build only (watch mode)
bun run build        # Full production build (web + server)
bun run check        # TypeScript type checking (tsc --noEmit)
bun run ci:check     # Biome lint + format check (CI mode, no auto-fix)
bun run fmt          # Auto-format with Biome
bun run lint         # Auto-fix lint issues with Biome
bun test             # Run tests (Bun test runner)
bun test <file>      # Run a single test file
```

## Architecture

This is an **MCP App template** — it builds interactive UIs for MCP (Model Context Protocol) tools. A single unified HTML bundle is built and served as an MCP resource, with runtime routing to the correct tool UI based on the `toolName` from the MCP host context.

### Two-Layer Structure

**API Server (`api/`)** — Bun HTTP server using `@decocms/runtime`. Defines MCP tools and resources, exposes them at `/api/mcp` via SSE.

**React UI (`web/`)** — React 19 app using `@modelcontextprotocol/ext-apps` SDK. Connects to the MCP host, receives tool input/results, and renders interactive UI.

### Tool Build Pipeline

All tool UIs live in `web/tools/<name>/`. Vite builds a single unified HTML file at `dist/client/index.html` (all CSS/JS inlined via `vite-plugin-singlefile`). At runtime, the `ToolRouter` component in `web/router.tsx` reads `toolName` from the MCP host context and renders the matching tool page from the `TOOL_PAGES` registry.

### Adding a New Tool

1. Create `api/tools/<name>.ts` — tool definition with Zod input/output schemas, `_meta.ui.resourceUri` linking to the resource
2. Register in `api/tools/index.ts`
3. Create `web/tools/<name>/` with the tool's page component
4. Register the page component in `TOOL_PAGES` in `web/router.tsx` (key must match the tool's `id`)
5. Create `api/resources/<name>.ts` — serves `dist/client/index.html` with MIME type `text/html;profile=mcp-app`

### MCP App Lifecycle (UI State Machine)

The UI renders based on `McpStatus`: `initializing` → `connected` → `tool-input` → `tool-result` (or `error` / `tool-cancelled`). See `web/types.ts` and `web/context.tsx`.

### Import Aliases

- `@/*` → `web/*` (components, hooks, lib)

## Code Style

- **Runtime**: Bun (not Node)
- **Formatter**: Biome with tab indentation, double quotes
- **Imports**: Must include `.ts`/`.tsx` extensions (`useImportExtensions: error`)
- **UI components**: shadcn/ui in `web/components/ui/` (do not lint these for a11y)
- **Styling**: Tailwind CSS v4, use `cn()` from `@/lib/utils.ts` for conditional classes
- **Validation**: Zod v4 for all schemas (tool input/output, state)
