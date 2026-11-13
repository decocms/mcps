# still-editor

Edit and republish Mix & Match product Stills with image models

## Getting Started

```bash
cd still-editor
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
4. Create `api/resources/my-tool.ts` serving `dist/client/my-tool.html`
5. Update build scripts in `package.json`
