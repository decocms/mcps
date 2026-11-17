# Dynamic Yield MCP

Tools for Dynamic Yield's public server-side APIs, plus `DY_ADMIN_*` tools for campaigns, audiences, strategies and reports, which have no public API and go through the DY console's internal API.

| Tool | API |
| --- | --- |
| `DY_CHOOSE` | `POST /v2/serve/user/choose` — campaign and recommendation QA, preview tokens |
| `DY_TRACK_PAGEVIEW` | `POST /v2/collect/user/pageview` |
| `DY_TRACK_EVENTS` | `POST /v2/collect/user/event` |
| `DY_TRACK_ENGAGEMENT` | `POST /v2/collect/user/engagement` |
| `DY_FEED_BULK` | `POST /v2/feeds/{feedId}/bulk` |
| `DY_FEED_TRANSACTION_STATUS` | `GET /v2/feeds/{feedId}/transaction/{id}[/item/{sku}]` |
| `DY_USER_PROFILE` | `GET /v2/userprofile` (Profile Anywhere) |

The collect tools write real data: use a dedicated test `dyid`.

### Console tools (internal API)

| Tool | What it does |
| --- | --- |
| `DY_ADMIN_SECTIONS_LIST` | Sections (sites) the session can access |
| `DY_ADMIN_CAMPAIGNS_LIST` | Campaigns of a section (all, API or App) |
| `DY_ADMIN_CAMPAIGN_GET` | Full campaign: experiences, targeting, variations, allocation |
| `DY_ADMIN_CAMPAIGN_SAVE` | Create or update a campaign (publishes immediately) |
| `DY_ADMIN_CAMPAIGN_SET_PAUSED` | Pause or resume a campaign |
| `DY_ADMIN_CAMPAIGNS_ARCHIVE` / `_DELETE` | Archive, unarchive or delete campaigns |
| `DY_ADMIN_CAMPAIGN_REPORT` | Experiment report per variation for a metric and date range |
| `DY_ADMIN_AUDIENCES_LIST` / `DY_ADMIN_AUDIENCE_GET` | Audiences and their conditions |
| `DY_ADMIN_AUDIENCE_SAVE` / `DY_ADMIN_AUDIENCES_DELETE` | Create, update or delete audiences |
| `DY_ADMIN_STRATEGIES_LIST` / `DY_ADMIN_STRATEGY_GET` | Recommendation strategies, rules and filters |
| `DY_ADMIN_STRATEGY_SAVE` / `DY_ADMIN_STRATEGIES_DELETE` | Create, update or delete strategies |
| `DY_ADMIN_GOALS_LIST` | Goals used as objectives and report metrics |
| `DY_ADMIN_FEEDS_LIST` / `DY_ADMIN_FEED_SYNC` | Data feeds, sync status and manual sync |

These call the API behind adm.dynamicyield.com. It is undocumented and can change without notice. Write tools require `confirm: true`.

## Connecting

1. In DY, open **Settings › API Keys › New Key**, choose **Server-side**, and grant the Experience API permissions plus **Feed** if you will use the feed tools.
2. In Studio, add the Dynamic Yield connection and paste the key as the token.
3. In the configuration, pick the site's data center (`us` or `eu`). Add a Profile Anywhere key only if you need `DY_USER_PROFILE`.

For the `DY_ADMIN_*` tools:

4. Fill **adminEmail** and **adminPassword** with a DY console user that logs in with email + password (no 2FA or company SSO). Prefer a dedicated user with access only to the sections it needs. The MCP logs in by itself and logs in again when the session expires.
   - 2FA/SSO accounts: instead, log in to adm.dynamicyield.com, copy the `RefreshToken` cookie (DevTools › Application › Cookies) into **adminSession**. It lasts 7 days from login.
5. Set **sectionId** to the site's section id: the `redirectToSectionId` in the console URL. `DY_ADMIN_SECTIONS_LIST` lists the others, and every tool accepts a `sectionId` to switch sites.

### Connecting directly (Claude Code, Claude Desktop, VS Code Copilot, Cursor)

Without Studio, send the configuration as HTTP headers. All are optional; send only what the tools you use need:

| Header | Same as |
| --- | --- |
| `Authorization: Bearer <key>` | DY server-side API key (public API tools) |
| `x-dy-region` | `region` (`us` or `eu`) |
| `x-dy-section-id` | `sectionId` |
| `x-dy-admin-email` / `x-dy-admin-password` | `adminEmail` / `adminPassword` |
| `x-dy-admin-session` | `adminSession` |
| `x-dy-profile-anywhere-key` | `profileAnywhereKey` |

**Claude Code**

```sh
claude mcp add --transport http --scope user dynamic-yield https://sites-dynamic-yield.deco.site/mcp \
  --header "Authorization: Bearer $DY_API_KEY" \
  --header "x-dy-section-id: 8795439" \
  --header "x-dy-admin-email: $DY_EMAIL" \
  --header "x-dy-admin-password: $DY_PASSWORD"
```

**VS Code (GitHub Copilot)**: `.vscode/mcp.json`. VS Code asks for the secrets once and keeps them in its secret storage.

```json
{
  "inputs": [
    { "type": "promptString", "id": "dy-api-key", "description": "DY API key", "password": true },
    { "type": "promptString", "id": "dy-email", "description": "DY console email" },
    { "type": "promptString", "id": "dy-password", "description": "DY console password", "password": true }
  ],
  "servers": {
    "dynamic-yield": {
      "type": "http",
      "url": "https://sites-dynamic-yield.deco.site/mcp",
      "headers": {
        "Authorization": "Bearer ${input:dy-api-key}",
        "x-dy-section-id": "8795439",
        "x-dy-admin-email": "${input:dy-email}",
        "x-dy-admin-password": "${input:dy-password}"
      }
    }
  }
}
```

**Claude Desktop**: its connectors UI only does OAuth, so bridge with `mcp-remote` in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "dynamic-yield": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote", "https://sites-dynamic-yield.deco.site/mcp",
        "--header", "Authorization:Bearer ${DY_API_KEY}",
        "--header", "x-dy-section-id:8795439",
        "--header", "x-dy-admin-email:${DY_EMAIL}",
        "--header", "x-dy-admin-password:${DY_PASSWORD}"
      ],
      "env": { "DY_API_KEY": "...", "DY_EMAIL": "...", "DY_PASSWORD": "..." }
    }
  }
}
```

**Cursor**: same `url` + `headers` as VS Code, in `~/.cursor/mcp.json`.

claude.ai (web) custom connectors only support OAuth, so use it through Studio.

The product feed must be set up in DY as **Sync via API** (Assets › Data Feeds); its numeric id is the `feedId`.

## Development

```sh
bun run dev    # serves http://localhost:8001/mcp
bun test
bun run check
```
