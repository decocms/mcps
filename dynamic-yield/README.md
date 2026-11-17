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

The product feed must be set up in DY as **Sync via API** (Assets › Data Feeds); its numeric id is the `feedId`.

## Development

```sh
bun run dev    # serves http://localhost:8001/mcp
bun test
bun run check
```
