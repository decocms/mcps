# Wake Commerce MCP

Read-only access to [Wake Commerce](https://wake.tech/) (fbits) for AI agents:

- **Storefront GraphQL API** — product search, catalog navigation, product
  detail, recommendations and shipping quotes.
- **Admin REST API** — store-level orders for analysis and reporting (admin,
  not per-shopper).

Cart, wishlist and customer/session operations are intentionally out of scope
for now.

## Configuration

| Field | Required | Description |
| --- | --- | --- |
| `storefrontToken` | ✅ | Wake Storefront API token, sent as the `TCS-Access-Token` header. Powers all catalog/product tools. [How to create one](https://wakecommerce.readme.io/docs/storefront-api-criacao-e-autenticacao-do-token). |
| `apiToken` | — | Wake Admin API token, sent as `Authorization: Basic <token>` for `api.fbits.net`. Required only for the admin order tools. |
| `account` | — | Wake account name (e.g. `erploja2`). Reference only. |

The MCP endpoint itself is protected by `withAuth`, which reads the `AUTH_TOKEN`
environment variable at startup (generate with `openssl rand -hex 32`).

The Storefront API is a single fixed endpoint
(`https://storefront-api.fbits.net/graphql`); the token identifies the store.
The Admin API is served from `https://api.fbits.net`.

## Tools

### Storefront (catalog) — requires `storefrontToken`

| Tool | Description |
| --- | --- |
| `WAKE_SEARCH_PRODUCTS` | Full-text catalog search with facet aggregations and price ranges. |
| `WAKE_LIST_PRODUCTS` | List products by explicit filters (id, sku, ean, category, brand, price, attributes); cursor-paginated. |
| `WAKE_GET_PRODUCT` | Full product detail: variants, attribute selections, prices, reviews, SEO. |
| `WAKE_AUTOCOMPLETE` | Search-as-you-type suggestions plus matching products. |
| `WAKE_PRODUCT_RECOMMENDATIONS` | Products recommended for a given product. |
| `WAKE_GET_HOTSITE` | Resolve a category / landing page by URL or id, with its products. |
| `WAKE_PRODUCT_OPTIONS` | Selectable attributes (color, size, …) and their variants. |
| `WAKE_GET_BUYLIST` | Buy list (kit / combo) by id, with component products. |
| `WAKE_SHOP_INFO` | Storefront metadata (name, URLs, checkout URLs). |
| `WAKE_RESOLVE_URL` | Resolve a storefront URL path to its route kind. |
| `WAKE_SHIPPING_QUOTES` | Shipping options (price, deadline) for a variant to a CEP. |

### Admin (orders / analytics) — requires `apiToken`

| Tool | Description |
| --- | --- |
| `WAKE_LIST_ORDERS` | List store orders by date range, status, payment method, customer or SKU; paginated. |
| `WAKE_GET_ORDER` | Full detail of a single order by id. |
| `WAKE_GET_ORDER_STATUS_HISTORY` | Status change history (timeline) of an order. |
| `WAKE_LIST_ORDER_STATUSES` | All order statuses configured in the store (to map ids before filtering). |

## Development

```bash
bun install          # from the monorepo root
cd wake
bun run dev          # hot-reload dev server
bun run check        # type-check
bun run build        # build server bundle
```

The GraphQL fragments and queries are mirrored from the production-proven
[deco.cx Wake app](https://github.com/deco-cx/apps/tree/main/wake) so they stay
valid against the live Storefront API.
