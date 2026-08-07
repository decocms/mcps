# MCP Template - Minimal

This is a minimal template for creating new MCP (Model Context Protocol) servers.

## Getting Started

This template is automatically used when you run:

```bash
bun scripts/new.ts your-mcp-name --description "Your MCP description"
```

## Authentication (already wired)

MCPs created from this template are served on a public hostname
(`https://sites-<name>.decocache.com/mcp`), and the runtime does not
authenticate the transport on its own. `server/main.ts` therefore wraps the
handler:

```ts
serve(withAuth(runtime.fetch));
```

`withAuth` reads the shared secret from the `AUTH_TOKEN` environment variable
**at startup**. Without it the process exits — an unconfigured MCP fails to
boot instead of serving anonymous traffic. Requests must present it as
`Authorization: Bearer <AUTH_TOKEN>`; `/_healthcheck` and CORS preflight are
the only exceptions.

`scripts/check-auth.ts` fails CI if the wrapper is removed, so do not delete it.

Two cases need an explicit override:

- **`Authorization` already carries a per-connection upstream credential** (a
  user's Strapi/Slack/VTEX key). Move the shared secret to its own header:
  `withAuth(runtime.fetch, { header: "x-deco-mcp-auth" })`.
- **OAuth callbacks and provider webhooks** are called by third parties that
  cannot present the secret. List them: `withAuth(runtime.fetch, {
  publicPaths: ["/oauth/callback"] })` — and give each one its own protection
  (state parameter, signature check, `?token=` secret).

Provisioning:

| Where | How |
| --- | --- |
| local | `.env` — generated for you by `scripts/new.ts`, gitignored |
| kubernetes-bun | add `AUTH_TOKEN` to the site state secret |
| cloudflare | `bunx wrangler secret put AUTH_TOKEN` |

Generate a value with `openssl rand -hex 32`. Minimum length is 24 characters.

Tools get a second layer: use `createPrivateTool`, never `createTool`.

## Structure

```
your-mcp/
├── server/
│   ├── main.ts              # Entry point - runtime configuration + withAuth
│   ├── types/
│   │   └── env.ts           # StateSchema and Env type
│   └── tools/
│       └── index.ts         # Tool exports
├── .env                     # Local AUTH_TOKEN (gitignored, generated)
├── .env.example             # Documents the required secret
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
   Requests need the token from `.env`:
   ```bash
   curl -X POST http://localhost:8001/mcp \
     -H "Authorization: Bearer $(grep AUTH_TOKEN .env | cut -d= -f2)" \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
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

