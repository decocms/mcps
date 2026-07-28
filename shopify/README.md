# Shopify MCP

Read-only MCP for the **Shopify Admin GraphQL API** (pinned to `2026-07`). Every tool is a
GraphQL query — never a mutation — so the MCP can never modify store data.

45 tools across 11 domains: products & collections, orders (drafts, abandoned checkouts,
returns, refund previews), fulfillment & locations, inventory, customers & segments,
discounts & marketing, online store content (pages, blogs, articles, menus, redirects,
themes), store properties & localization, B2B companies & markets, Shopify Payments,
and ShopifyQL analytics. See [TOOLS.md](./TOOLS.md) for the full catalog and scope map.

## Setup

Connecting is a one-click **OAuth** flow — no manual token copying:

1. In the connection UI, start the OAuth flow. You'll land on a page asking for your
   store's `my-store.myshopify.com` domain.
2. Shopify shows the standard authorization screen listing the requested **read scopes**.
   Approve it and you're connected — the MCP stores a read-only **offline access token**
   (it never expires, so there's no refresh).
3. **API Version** (optional config field): defaults to `2026-07`.

Default scopes requested: `read_products`, `read_orders`, `read_customers`,
`read_inventory`, `read_fulfillments`, `read_locations`, `read_discounts`, `read_content`,
`read_themes`, `read_locales`, `read_translations`, `read_marketing_events`,
`read_markets`, `read_reports`. Override with the `SHOPIFY_SCOPES` env var
(comma-separated) to add or trim.

Some scopes are **plan/entitlement-gated** and are left out of the default because Shopify
rejects the whole authorize request (`missing_shopify_permission`) if the store can't grant
them: `read_users` and `read_companies` need **Shopify Plus**;
`read_shopify_payments_payouts`/`read_shopify_payments_disputes` need **Shopify Payments**.
Add them via `SHOPIFY_SCOPES` only for stores that have them. Tools whose scope is missing
fail with a clear ACCESS_DENIED hint. Orders older than 60 days additionally require
`read_all_orders`, which Shopify only grants to approved apps.

The OAuth flow needs a **public Shopify Partner app**; its `SHOPIFY_CLIENT_ID`,
`SHOPIFY_CLIENT_SECRET` and `SHOPIFY_TOKEN_SECRET` are provided as deploy secrets — see
[`.github/workflows/SECRETS.md`](../.github/workflows/SECRETS.md).

### Local development

For local dev you can skip OAuth and pass a raw Admin API token via env vars:

```sh
SHOPIFY_STORE_DOMAIN=my-store.myshopify.com SHOPIFY_ACCESS_TOKEN=shpat_xxx bun run dev
```

Env vars are a fallback — a connected OAuth credential (or a raw token in the Authorization
header) always wins.

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

OAuth (authorization code grant, offline token). Shopify's authorize endpoint is
per-store, but the runtime's `authorizationUrl(callbackUrl)` hook doesn't know which store
the user wants. So (like the WhatsApp MCP) the hook points at our own `/oauth/custom` page,
which asks for the shop domain and then drives the real Shopify grant. See the flow diagram
in [`server/lib/oauth.ts`](./server/lib/oauth.ts).

The Shopify access token is sealed (AES-256-GCM, keyed by `SHOPIFY_TOKEN_SECRET`) together
with the shop domain into the connection's access token, so both travel back through the
browser redirect without exposing the raw token, and every tool call carries the store it
belongs to — no separate Store Domain config field. Legacy connections that used a raw
Admin API token plus a `storeDomain` state field still work.

A raw admin token in the `Authorization` header (no OAuth) is still accepted as a fallback,
which is what the local-dev env vars use.
