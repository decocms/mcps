# Shopify MCP — Tool Selection (read-only)

Final tool list for the new `shopify` MCP. **Decision: the MCP is read-only** — every tool
wraps a query against the **Shopify Admin GraphQL API** (version `2026-07`, current stable).
No mutations, so the MCP can never modify store data.

All tools below are selected (`[x]`). The `Tier` column just indicates expected usage:
**core** = day-1 essentials, **rec** = common, **opt** = niche but harmless to include.

## API facts (verified 2026-07-14)

- **GraphQL only.** The REST Admin API is legacy and closed to new apps — every tool wraps a
  GraphQL query against `https://{store}.myshopify.com/admin/api/2026-07/graphql.json`.
- **Auth:** single header `X-Shopify-Access-Token` (Admin API access token from a custom app).
  Fits our `MESH_REQUEST_CONTEXT.authorization` pattern, **but we also need the store domain** —
  see [Open questions](#open-questions).
- **Scopes:** the token only needs **read scopes** (`read_products`, `read_orders`,
  `read_customers`, …). Listed per domain below for the README.
- **Rate limits:** cost-based bucket (1,000 points, restores 50/s on standard plans).
- Docs: https://shopify.dev/docs/api/admin-graphql/latest ·
  Full index: https://shopify.dev/docs/api/admin-graphql/2026-07/full-index

## Selection at a glance

~40 read-only tools across 11 domains: products & collections, orders (incl. drafts,
returns, abandoned checkouts), fulfillment, inventory, customers, discounts, online store
content, store properties, B2B, markets, and Shopify Payments.

Excluded by decision (2026-07-14): gift cards, metafields/metaobjects, files, webhooks.

---

## 1. Products & Collections

Scopes: `read_products`

| Pick | Tool | GraphQL op | What it does | Tier |
|---|---|---|---|---|
| [x] | `SHOPIFY_LIST_PRODUCTS` | `products` | Paginated product list with Shopify search-syntax filters (status, vendor, tag, sku…) | core |
| [x] | `SHOPIFY_GET_PRODUCT` | `product` / `productByIdentifier` | Fetch one product by ID or handle, incl. variants, options, media | core |
| [x] | `SHOPIFY_LIST_PRODUCT_VARIANTS` | `productVariants` | List/search variants across the store (price, sku, barcode, inventory item) | core |
| [x] | `SHOPIFY_LIST_COLLECTIONS` | `collections` | List custom + smart collections | core |
| [x] | `SHOPIFY_GET_COLLECTION` | `collection` / `collectionByIdentifier` | Fetch a collection incl. products and smart-collection rules | core |
| [x] | `SHOPIFY_LIST_PUBLICATIONS` | `publications` | Sales channels (Online Store, POS, custom apps) and what's published where | opt |

## 2. Orders

Scopes: `read_orders` (60-day history; `read_all_orders` for older), `read_returns`

| Pick | Tool | GraphQL op | What it does | Tier |
|---|---|---|---|---|
| [x] | `SHOPIFY_LIST_ORDERS` | `orders` | Paginated order list with filters (status, financial/fulfillment status, date, customer) | core |
| [x] | `SHOPIFY_GET_ORDER` | `order` | Full order: line items, transactions, fulfillments, refunds, timeline | core |
| [x] | `SHOPIFY_LIST_DRAFT_ORDERS` | `draftOrders` | List draft orders | core |
| [x] | `SHOPIFY_GET_DRAFT_ORDER` | `draftOrder` | Fetch a draft order | core |
| [x] | `SHOPIFY_LIST_ABANDONED_CHECKOUTS` | `abandonedCheckouts` | Recoverable abandoned checkouts | rec |
| [x] | `SHOPIFY_CALCULATE_REFUND` | `order.suggestedRefund` | Preview what a refund would amount to (pure calculation, changes nothing) | rec |
| [x] | `SHOPIFY_LIST_RETURNS` | `order.returns` / `returnableFulfillments` | Returns on an order and what's still returnable | opt |

## 3. Fulfillment & Shipping

Scopes: `read_fulfillments`, `read_assigned_fulfillment_orders`, `read_locations`, `read_shipping`

| Pick | Tool | GraphQL op | What it does | Tier |
|---|---|---|---|---|
| [x] | `SHOPIFY_LIST_FULFILLMENT_ORDERS` | `order.fulfillmentOrders` | Fulfillment orders for an order: assigned location, line items, holds, status | rec |
| [x] | `SHOPIFY_LIST_LOCATIONS` | `locations` | Store locations (needed to interpret inventory + fulfillment data) | core |
| [x] | `SHOPIFY_LIST_CARRIER_SERVICES` | `carrierServices` | Registered shipping-rate providers | opt |

## 4. Inventory

Scopes: `read_inventory`

| Pick | Tool | GraphQL op | What it does | Tier |
|---|---|---|---|---|
| [x] | `SHOPIFY_GET_INVENTORY_LEVELS` | `inventoryItem.inventoryLevels` / `location.inventoryLevels` | Quantities (available, on-hand, committed, incoming) per item × location | core |
| [x] | `SHOPIFY_GET_INVENTORY_ITEM` | `inventoryItem` | Item details: cost, tracked flag, country of origin, HS code | rec |

## 5. Customers

Scopes: `read_customers`

| Pick | Tool | GraphQL op | What it does | Tier |
|---|---|---|---|---|
| [x] | `SHOPIFY_LIST_CUSTOMERS` | `customers` | Search customers (email, phone, tag, state, date filters) | core |
| [x] | `SHOPIFY_GET_CUSTOMER` | `customer` / `customerByIdentifier` | Full profile: addresses, marketing consent, lifetime spend | core |
| [x] | `SHOPIFY_GET_CUSTOMER_ORDERS` | `customer.orders` | Orders for one customer | core |
| [x] | `SHOPIFY_LIST_SEGMENTS` | `segments`, `customerSegmentMembers` | Customer segments and their members | opt |

## 6. Discounts

Scopes: `read_discounts`, `read_marketing_events`

| Pick | Tool | GraphQL op | What it does | Tier |
|---|---|---|---|---|
| [x] | `SHOPIFY_LIST_DISCOUNTS` | `discountNodes` | All discounts (code + automatic) with status/type filters | rec |
| [x] | `SHOPIFY_GET_DISCOUNT` | `discountNode` | One discount incl. rules and usage counts | rec |
| [x] | `SHOPIFY_LIST_MARKETING_ACTIVITIES` | `marketingActivities` | Marketing campaigns/activities | opt |

## 7. Online Store Content

Scopes: `read_content`, `read_online_store_navigation`, `read_themes`

| Pick | Tool | GraphQL op | What it does | Tier |
|---|---|---|---|---|
| [x] | `SHOPIFY_LIST_PAGES` | `pages` | Store pages (body, SEO, publish state) | rec |
| [x] | `SHOPIFY_LIST_BLOGS` | `blogs` | Blogs | rec |
| [x] | `SHOPIFY_LIST_ARTICLES` | `articles` | Blog posts across blogs (author, tags, publish date) | rec |
| [x] | `SHOPIFY_LIST_MENUS` | `menus` | Navigation menus | opt |
| [x] | `SHOPIFY_LIST_REDIRECTS` | `urlRedirects` | URL redirects | opt |
| [x] | `SHOPIFY_LIST_THEMES` | `themes` | Installed themes + roles (main, unpublished…) | opt |
| [x] | `SHOPIFY_GET_THEME_FILES` | `theme.files` | Read theme files (liquid, JSON templates) | opt |

## 8. Store Properties & Localization

Scopes: none for `shop` basics; `read_locales`, `read_translations`, `read_users`

| Pick | Tool | GraphQL op | What it does | Tier |
|---|---|---|---|---|
| [x] | `SHOPIFY_GET_SHOP_INFO` | `shop` | Name, domains, plan, currency, timezone, contact, features — also the natural "test connection" tool | core |
| [x] | `SHOPIFY_LIST_LOCALES` | `shopLocales` | Enabled languages | opt |
| [x] | `SHOPIFY_GET_TRANSLATIONS` | `translatableResources` | Translated content per resource | opt |
| [x] | `SHOPIFY_LIST_STAFF` | `staffMembers` | Staff accounts | opt |
| [x] | `SHOPIFY_LIST_EVENTS` | `events` | Timeline/audit events on resources | opt |

## 9. B2B & Markets (Shopify Plus)

Scopes: `read_companies`, `read_markets`

| Pick | Tool | GraphQL op | What it does | Tier |
|---|---|---|---|---|
| [x] | `SHOPIFY_LIST_COMPANIES` | `companies` | B2B company accounts, contacts, locations | opt |
| [x] | `SHOPIFY_LIST_MARKETS` | `markets` | Markets, regions, web presences, currency settings | opt |

## 10. Shopify Payments / Finance

Scopes: `read_shopify_payments_payouts`, `read_shopify_payments_disputes`

| Pick | Tool | GraphQL op | What it does | Tier |
|---|---|---|---|---|
| [x] | `SHOPIFY_LIST_PAYOUTS` | `shopifyPaymentsAccount.payouts` | Payout history + schedule | opt |
| [x] | `SHOPIFY_GET_PAYMENTS_BALANCE` | `shopifyPaymentsAccount.balance` | Pending balance | opt |
| [x] | `SHOPIFY_LIST_DISPUTES` | `shopifyPaymentsAccount.disputes` | Chargebacks/inquiries | opt |
| [x] | `SHOPIFY_LIST_BALANCE_TRANSACTIONS` | `shopifyPaymentsAccount.balanceTransactions` | Ledger of fees, charges, payouts | opt |

## 11. Analytics

Scopes: `read_reports`

| Pick | Tool | GraphQL op | What it does | Tier |
|---|---|---|---|---|
| [x] | `SHOPIFY_RUN_SHOPIFYQL` | `shopifyqlQuery` | ShopifyQL analytics queries (sales, sessions over time) — historically gated/unstable, verify availability during implementation | opt |

---

## Excluded (and why)

| Surface | Why excluded |
|---|---|
| **All mutations** | MCP is read-only by decision — no create/update/delete of any resource |
| **Gift cards, metafields/metaobjects, files, webhooks** | Cut from scope by decision (2026-07-14) |
| **Bulk operations** (`bulkOperationRunQuery`) | Read-only in effect, but implemented as mutations and add async/polling complexity; revisit if large exports become a need |
| **Raw GraphQL passthrough** (`SHOPIFY_RUN_GRAPHQL`) | Can't guarantee read-only — a passthrough would accept mutations. Could add later as a query-only variant that rejects mutation documents |
| **Subscriptions** (`subscriptionContracts`) | Readable only by the app that owns the contracts — useless with a generic custom-app token |
| **Access/OAuth, Apps & Billing, Cart/Functions, Checkout branding, Retail/POS, Privacy** | App-developer or niche surface, not store insight |
| **Storefront API / Customer Account API** | Different, buyer-facing APIs; this MCP targets Admin |

## Decisions

1. **Store domain configuration:** Magento approach — the Admin API access token goes in the
   connection-level Authorization (Bearer) field, and `storeDomain` is a required field in the
   connection `configSchema` (with `SHOPIFY_STORE_DOMAIN` / `SHOPIFY_ACCESS_TOKEN` env fallbacks
   for local dev).
2. **API version:** pinned to `2026-07`, overridable via the optional `apiVersion` config field.
3. **OAuth:** not implemented in v1 — Shopify OAuth needs a registered partner app
   (client id/secret) and a per-store authorization URL, which the current runtime `oauth`
   hook can't express (the shop domain isn't known when building the URL). Token auth
   (custom-app Admin token) is the supported flow, same as Magento.
