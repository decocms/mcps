# Wake Commerce MCP

Read-only access to the [Wake Commerce](https://wake.tech/) (fbits) **Storefront
GraphQL API** for AI agents — product search, catalog navigation, product
detail, recommendations and shipping quotes.

This is **V1**: storefront reads only. Cart, wishlist, customer and Admin (REST)
operations are intentionally out of scope for now.

## Configuration

| Field | Required | Description |
| --- | --- | --- |
| `storefrontToken` | ✅ | Wake Storefront API token, sent as the `TCS-Access-Token` header. [How to create one](https://wakecommerce.readme.io/docs/storefront-api-criacao-e-autenticacao-do-token). |
| `account` | — | Wake account name (e.g. `erploja2`). Reference only. |

The MCP endpoint itself is protected by `withAuth`, which reads the `AUTH_TOKEN`
environment variable at startup (generate with `openssl rand -hex 32`).

The Storefront API is a single fixed endpoint
(`https://storefront-api.fbits.net/graphql`); the token identifies the store.

## Tools

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
