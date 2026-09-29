# Dynamic Yield MCP

Tools for Dynamic Yield's public server-side APIs. Campaigns, audiences, strategies and reports have no public API and stay in the DY console.

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

## Connecting

1. In DY, open **Settings › API Keys › New Key**, choose **Server-side**, and grant the Experience API permissions plus **Feed** if you will use the feed tools.
2. In Studio, add the Dynamic Yield connection and paste the key as the token.
3. In the configuration, pick the site's data center (`us` or `eu`). Add a Profile Anywhere key only if you need `DY_USER_PROFILE`.

The product feed must be set up in DY as **Sync via API** (Assets › Data Feeds); its numeric id is the `feedId`.

## Development

```sh
bun run dev    # serves http://localhost:8001/mcp
bun test
bun run check
```
