# multi-channel-inbox

Unified support inbox for Slack, Discord and Gmail

## Getting Started

```bash
cd multi-channel-inbox
bun install
bun run dev
```

## Structure

- `api/` — MCP server (Bun + @decocms/runtime)
- `web/` — React UI (Vite + TanStack Router + shadcn/ui)

## Adding a New Tool

1. Create `api/tools/my-tool.ts` using `createTool`
2. Register in `api/tools/index.ts`
3. Create `web/tools/my-tool/index.tsx` for the UI
4. Register the page component in `TOOL_PAGES` in `web/router.tsx` (key must match the tool's `id`)
5. Create `api/resources/my-tool.ts` serving `dist/client/index.html`
6. Update build scripts in `package.json`
