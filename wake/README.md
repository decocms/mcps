# Wake Commerce MCP

Access to [Wake Commerce](https://wake.tech/) (fbits) for AI agents. Everything is
read-only except the product image tools:

- **Storefront GraphQL API** — product search, catalog navigation, product
  detail, recommendations and shipping quotes.
- **Admin REST API** — store-level orders for analysis and reporting, and
  product variant images (admin, not per-shopper).

Cart, wishlist and customer/session operations are intentionally out of scope
for now.

## Configuration

| Field | Required | Description |
| --- | --- | --- |
| `storefrontToken` | ✅ | Wake Storefront API token, sent as the `TCS-Access-Token` header. Powers all catalog/product tools. [How to create one](https://wakecommerce.readme.io/docs/storefront-api-criacao-e-autenticacao-do-token). |
| `apiToken` | — | Wake Admin API token, sent as `Authorization: Basic <token>` for `api.fbits.net`. Required only for the admin tools (orders, product images). |
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
| `WAKE_LIST_ORDERS` | List store orders by date range, status, payment method, customer, SKU or a list of ids; paginated, with `total` and `hasMore`. `fields: "analytics"` returns the orders without personal data. |
| `WAKE_GET_ORDER` | Full detail of a single order by id. |
| `WAKE_GET_ORDER_STATUS_HISTORY` | Status change history (timeline) of an order. |
| `WAKE_LIST_ORDER_STATUSES` | All order statuses configured in the store (to map ids before filtering). |
| `WAKE_LIST_PAYMENT_METHODS` | The store's payment methods, to name an order's `formaPagamentoId`. |
| `WAKE_LIST_ORDER_ORIGINS` | The store's order origins (Site, App, PDV…), to name an order's `origemPedido`. |
| `WAKE_DASHBOARD` | Store-wide aggregates for a period in one call: revenue, orders and average ticket per hour/day, payment methods, best sellers, abandoned carts. Only `captados` is by order date (it matches `WAKE_LIST_ORDERS`); `pagos`, `enviados` and `cancelados` count the orders that reached that state in the bucket. `faturamento` compares with the same number of days just before unless told otherwise. |
| `WAKE_LIST_DISTRIBUTION_CENTERS` | Distribution centers; order items name the one that fulfilled them. |
| `WAKE_LIST_PHYSICAL_STORES` | Physical stores with their distribution center; an order's `retiradaLojaId` is one of them. |

Orders, in short:

- **Dates are the store's local time**, with no offset, in what Wake returns and in the filters. A bare day (`2026-11-25`) means the whole day.
- **The list already returns complete orders.** For several known orders use `listaPedidosIds` (up to 50) instead of `WAKE_GET_ORDER` in a loop.
- **Paging stops at page 199** (at most 10,000 orders per query): split long periods into days or hours.
- **`DataAlteracao`** in `enumTipoFiltroData` lists the orders changed in a window, for incremental reads. Whatever the filter, rows are sorted by the order date (`data`).
- **`fields: "analytics"`** keeps status, dates, totals, coupon, channel, fulfilling distribution centers, pickup store, city/state, items with their promotions, payment group and brand, and UTMs and other non-personal metadata. It drops the buyer, documents, phones, street address, card data, Pix QR code and free-text notes.

### Rate limit

Wake allows 120 requests per minute per Admin token and answers 429 with `Retry-After` past that. **A token that keeps calling after a 429 is blocked for an hour**, together with every integration that shares it. So every admin call goes through a per-token gate:

- **Pacing:** at most `WAKE_ADMIN_MAX_PER_MINUTE` calls per minute (default 100) per token, per process. A call waits up to 15 s for a free slot.
- **After a 429:** the token is refused locally until `Retry-After` has passed, without reaching Wake.
- **No retries:** a refusal fails with a message that starts with `[wake-rate-limited]` and ends with `retry-after=<seconds>`, so callers can back off.

Give each heavy consumer its own Admin token (Wake admin › Extensões e Integrações › Tokens), with only the GET permissions it reads.

### Admin (product variant images) — requires `apiToken` with product image permission

These change the live store. Images are addressed by **variant** id (`productVariantId` from the Storefront API); with a product id the Admin API answers "Nenhuma imagem encontrada".

| Tool | Description |
| --- | --- |
| `WAKE_ADMIN_VARIANT_IMAGES_LIST` | Images of one variant: id, URL, order, print (estampa) flag. |
| `WAKE_ADMIN_VARIANT_IMAGE_ADD` | Upload one image (base64 or an https URL, JPEG or PNG, up to 2 MB) at a given order; returns the new image id. |
| `WAKE_ADMIN_VARIANT_IMAGE_DELETE` | Delete one image by id. Cannot be undone. |

When Wake rejects the `apiToken` (HTTP 401/403: expired, revoked, missing permission or not accepted from this server), every admin tool fails with a message that starts with `[wake-admin-token-rejected]` and asks to renew the token, so apps can show that instead of a generic error.

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
