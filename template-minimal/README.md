# MCP Template - Minimal

This is a minimal template for creating new MCP (Model Context Protocol) servers.

## Getting Started

This template is automatically used when you run:

```bash
bun scripts/new.ts your-mcp-name --description "Your MCP description"
```

## Structure

```
your-mcp/
├── server/
│   ├── main.ts              # Entry point - runtime configuration
│   ├── types/
│   │   └── env.ts           # StateSchema and Env type
│   └── tools/
│       └── index.ts         # Tool exports
├── app.json.example         # Template for store metadata
├── app.json                 # Store metadata (rename from .example)
├── package.json
├── tsconfig.json
└── README.md
```

## Next Steps

After creating your MCP:

1. **Configure StateSchema** in `server/types/env.ts`
   - Add API credentials
   - Add bindings (database, event-bus, etc.)
   - Organize by category for better UX

2. **Implement Tools** in `server/tools/`
   - Create tool files (e.g., `my-tool.ts`)
   - Export factories in `index.ts`

3. **Configure app.json** for store publishing
   - Rename `app.json.example` to `app.json`
   - Update all fields (name, url, description, icon)
   - See `.cursor/rules/app-json-schema.mdc` for complete schema

4. **Test locally**
   ```bash
   bun run dev
   ```

5. **Enable automatic deployment** (optional)
   - Add your MCP to `deploy.json` in the root
   - This enables auto-deploy to production on merge to main
   - See other MCPs in `deploy.json` for examples

6. **Format and lint** (before committing)
   ```bash
   bun run fmt && bun run lint
   ```

## Examples

Check these MCPs for reference:
- **Simple**: `perplexity/` - API-only MCP
- **Google OAuth**: `google-calendar/` - OAuth + API
- **Complex Config**: `slack-mcp/` - Organized StateSchema
- **With Bindings**: `mcp-studio/` - Database + Event Bus

## Documentation

- [Creating New MCPs](.cursor/rules/mcp-creation.mdc)
- [StateSchema Patterns](.cursor/rules/mcp-creation.mdc#stateschema-organization-pattern)
- [Bindings Guide](.cursor/rules/bindings.mdc)
- [app.json Schema](.cursor/rules/app-json-schema.mdc)

