# Shopify MCP

MCP for the **Shopify Admin GraphQL API** (pinned to `2026-07`). Almost every tool is a
read-only GraphQL query; the sole exception is theme-file editing — two mutations
(`SHOPIFY_UPDATE_THEME_FILES`, `SHOPIFY_DELETE_THEME_FILES`) that create, overwrite or delete
Liquid templates and theme assets. Nothing else can modify store data.

47 tools across 11 domains: products & collections, orders (drafts, abandoned checkouts,
returns, refund previews), fulfillment & locations, inventory, customers & segments,
discounts & marketing, online store content (pages, blogs, articles, menus, redirects,
themes — read **and** write), store properties & localization, B2B companies & markets,
Shopify Payments, and ShopifyQL analytics. See [TOOLS.md](./TOOLS.md) for the full catalog
and scope map.

## Setup

Connecting is a one-click **OAuth** flow — no manual token copying:

1. In the connection UI, start the OAuth flow. You'll land on a page asking for your
   store's `my-store.myshopify.com` domain.
2. Shopify shows the standard authorization screen listing the requested scopes (all read,
   plus **`write_themes`** for theme editing). Approve it and you're connected — the MCP
   stores an **expiring offline access token** (~1h) plus a rotating **refresh token** (~90d).
   The connection refreshes itself automatically; you only re-run OAuth if the refresh token
   lapses or you revoke the app.

There's no connection config to fill in. The Admin API version defaults to `2026-07`;
override it per deployment with the `SHOPIFY_API_VERSION` env var.

Default scopes requested: `read_products`, `read_orders`, `read_customers`,
`read_inventory`, `read_fulfillments`, `read_locations`, `read_discounts`, `read_content`,
`read_themes`, `write_themes`, `read_locales`, `read_translations`, `read_marketing_events`,
`read_markets`, `read_reports`. Override with the `SHOPIFY_SCOPES` env var
(comma-separated) to add or trim — e.g. drop `write_themes` for a strictly read-only
deployment (the two theme-write tools then fail with an ACCESS_DENIED hint).

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

### Protected customer data (required for the customer tools)

The `read_customers` scope alone is **not** enough to read the `Customer` object. Shopify
gates all customer data behind a separate, app-level approval called
[**Protected Customer Data**](https://shopify.dev/docs/apps/launch/protected-customer-data),
independent of OAuth scopes. Without it, any customer tool
(`SHOPIFY_LIST_CUSTOMERS`, customer lookups, segments, order→customer joins, …) fails with:

> `This app is not approved to access the Customer object. See
> https://shopify.dev/docs/apps/launch/protected-customer-data …`

To enable it, in the **Partner Dashboard**:

1. Apps → *your app* → **API access**.
2. Find **Protected customer data access** → **Request access**.
3. Grant the levels you need:
   - **Protected customer data** (level 1) — required for _any_ `Customer` access.
   - **Protected customer fields** (level 2) — PII: name, email, phone, address.
4. Complete the data-protection questionnaire (how you use, store, encrypt and retain the
   data). Public/distributed apps are reviewed by Shopify; custom/dev apps are usually
   granted immediately.
5. Save, then **reconnect the MCP** (re-run OAuth) if the error persists — the protected-data
   consent sometimes only takes effect on the next grant.

If you don't need customer data, drop `read_customers` from `SHOPIFY_SCOPES` and the rest of
the toolset works unaffected.

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

OAuth (authorization code grant, **expiring** offline token). Shopify's authorize endpoint
is per-store, but the runtime's `authorizationUrl(callbackUrl)` hook doesn't know which store
the user wants. So (like the WhatsApp MCP) the hook points at our own `/oauth/custom` page,
which asks for the shop domain and then drives the real Shopify grant. See the flow diagram
in [`server/lib/oauth.ts`](./server/lib/oauth.ts).

Shopify no longer issues non-expiring offline tokens — the Admin API rejects them with a
`403` (`Non-expiring access tokens are no longer accepted`). The code exchange therefore
sends `expiring=1`, which yields a ~1h access token plus a ~90d rotating refresh token. Both
are sealed (AES-256-GCM, keyed by `SHOPIFY_TOKEN_SECRET`) together with the shop domain, so
they travel back through the browser redirect without exposing the raw tokens and every tool
call carries the store it belongs to — no separate Store Domain config field. When the access
token expires, the client re-hits the runtime `/token` endpoint with
`grant_type=refresh_token`; the MCP's `refreshToken` hook rotates it against Shopify and
returns a freshly sealed pair. A Shopify `4xx` on refresh (rotated-out or lapsed token, app
uninstalled) surfaces as `invalid_grant` so the client knows to reconnect; a `5xx`/network
error is treated as transient. Legacy connections that used a raw Admin API token plus a
`storeDomain` state field still work.

A raw admin token in the `Authorization` header (no OAuth) is still accepted as a fallback,
which is what the local-dev env vars use.
