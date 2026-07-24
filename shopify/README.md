# Shopify MCP

Read-only MCP for the **Shopify Admin GraphQL API** (pinned to `2026-07`). Every tool is a
GraphQL query — never a mutation — so the MCP can never modify store data.

45 tools across 11 domains: products & collections, orders (drafts, abandoned checkouts,
returns, refund previews), fulfillment & locations, inventory, customers & segments,
discounts & marketing, online store content (pages, blogs, articles, menus, redirects,
themes), store properties & localization, B2B companies & markets, Shopify Payments,
and ShopifyQL analytics. See [TOOLS.md](./TOOLS.md) for the full catalog and scope map.

## Setup

1. In the Shopify admin, create a **custom app** (Settings → Apps and sales channels →
   Develop apps) and give it the **read scopes** you need — e.g. `read_products`,
   `read_orders`, `read_customers`, `read_inventory`, `read_fulfillments`, `read_locations`,
   `read_discounts`, `read_content`, `read_themes`, `read_locales`, `read_translations`,
   `read_marketing_events`, `read_users`, `read_companies`, `read_markets`,
   `read_shopify_payments_payouts`, `read_shopify_payments_disputes`, `read_reports`.
   Tools whose scope is missing fail with a clear ACCESS_DENIED hint; grant only what you use.
2. Install the app on the store and copy the **Admin API access token** (`shpat_…`).
3. Connect the MCP:
   - **Token** (connection Authorization field): the Admin API access token
   - **Store Domain** (config field): `my-store.myshopify.com`
   - **API Version** (optional): defaults to `2026-07`

Orders older than 60 days additionally require the `read_all_orders` scope, which Shopify
only grants to approved apps.

### Local development

```sh
SHOPIFY_STORE_DOMAIN=my-store.myshopify.com SHOPIFY_ACCESS_TOKEN=shpat_xxx bun run dev
```

Env vars are a fallback — connection state (`storeDomain`) and the Authorization header
always win.

## Development

```sh
bun run check             # typecheck
bun test                  # unit tests (credential resolution, retry/backoff, connection flattening)
bun run validate:queries  # validates every GraphQL document against the live Shopify schema
```

`validate:queries` posts each tool's query to shopify.dev's public GraphiQL proxy
(`https://shopify.dev/admin-graphql-direct-proxy/<version>`), which validates against the
real Admin API schema and executes on demo data — no store or token required. Run it when
bumping the API version.

## Auth notes

Token auth only (same pattern as the Magento MCP). Shopify OAuth would require a registered
partner app (client id/secret) and a per-store authorization URL, which the runtime `oauth`
hook can't currently express — the shop domain isn't known when the authorization URL is
built. If a partner app ever exists, the OAuth flow can be added in `server/main.ts`.
