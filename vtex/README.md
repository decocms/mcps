# VTEX Commerce MCP

MCP server for interacting with VTEX Commerce APIs. Auto-generated from VTEX's official OpenAPI schemas, providing 700+ tools across 67 API modules for catalog, orders, logistics, pricing, and more.

## MCP URL

```
https://sites-vtex.deco.site/mcp
```

## Features

- **700+ tools** auto-generated from VTEX OpenAPI specs — no manual schema maintenance
- **67 API modules** covering the full VTEX platform
- **Type-safe** — Zod validation on all request parameters
- **Custom tools** for complex multi-step operations not covered by the generated SDK
- **Flexible auth** — credentials via connection config or environment variables

## API Coverage

### Core E-Commerce

| Module | Example Tools |
|--------|--------------|
| **Catalog** (Brand, Category, Product, SKU) | `VTEX_GET_PRODUCT`, `VTEX_LIST_BRANDS`, `VTEX_CREATE_SKU`, `VTEX_UPDATE_PRODUCT` |
| **Orders** | `VTEX_GET_ORDER`, `VTEX_LIST_ORDERS`, `VTEX_CANCEL_ORDER`, `VTEX_START_HANDLING_ORDER` |
| **Logistics** (Warehouse, Inventory) | `VTEX_GET_WAREHOUSE`, `VTEX_LIST_WAREHOUSES`, `VTEX_GET_INVENTORY`, `VTEX_UPDATE_INVENTORY` |
| **Pricing** | `VTEX_GET_PRICE`, `VTEX_UPDATE_PRICE`, `VTEX_GET_FIXED_PRICES`, `VTEX_GET_COMPUTED_PRICE` |
| **Collections** | `VTEX_GET_COLLECTION`, `VTEX_LIST_COLLECTIONS`, `VTEX_CREATE_COLLECTION` |

### Extended Modules

Checkout, Intelligent Search, Promotions & Taxes, Marketplace, Payments Gateway, Master Data (V1 & V2), Profile System, Subscriptions, Reviews & Ratings, Recommendations, B2B Suite (Buyer Data, Contracts, Organizations, Buying Policies, Budgets), Giftcard, Pick & Pack, Customer Credit, VTEX Shipping Network, Headless CMS, Message Center, Session Manager, License Manager, VTEX ID, Tracking, and more.

### Custom Tools

These handle multi-step operations not available in the generated SDK:

| Tool | Description |
|------|-------------|
| `VTEX_SEARCH_COLLECTIONS` | Search collections by name or terms |
| `VTEX_REORDER_COLLECTION` | Reorder collections with SKU/product IDs via XML import |
| `VTEX_UPDATE_PRODUCT_SPECIFICATIONS` | Bulk replace product specifications |
| `VTEX_GET_ORDERS_TREND` | Admin home dashboard orders trend (internal analytics service); exchanges App Key/Token for a session token under the hood |
| `VTEX_GET_HOME_METRICS_SUMMARY` | Admin home dashboard metrics summary (revenue, orders, sessions, conversion) vs previous day |
| `VTEX_GET_HOME_TOP_VIEWED_PRODUCTS` | Most viewed products on the admin home dashboard |
| `VTEX_GET_HOME_TOP_PRODUCTS` | Top-selling products on the admin home dashboard ranked by revenue vs previous day |

## Authentication

The server uses VTEX App Key/Token authentication. Credentials are sent with every API request via the `X-VTEX-API-AppKey` and `X-VTEX-API-AppToken` headers.

### Connection Config

When connecting through the MCP URL, provide:

| Field | Description |
|-------|-------------|
| `accountName` | Your VTEX account name |
| `appKey` | Your VTEX App Key |
| `appToken` | Your VTEX App Token |

### Environment Variables

For local development, create a `.env` file:

```env
VTEX_ACCOUNT_NAME=your-account-name
VTEX_APP_KEY=your-app-key
VTEX_APP_TOKEN=your-app-token
```

### Internal endpoints (VtexId session-token auth)

A few VTEX services power the **admin UI** rather than the public API — for
example the home dashboard analytics under `/api/analytics/consumption/*`. These
are **not in VTEX's OpenAPI specs** (so no tool is generated for them) and they
**reject the `X-VTEX-API-AppKey` / `X-VTEX-API-AppToken` headers with `401`**.
They only accept a **VtexId session token** — the same credential the browser
sends as the `VtexIdclientAutCookie` cookie.

To call one of these from a tool, mint a session token from the connection's App
Key/Token and send it as a cookie. The shared helper in
[`server/lib/vtexid-session.ts`](server/lib/vtexid-session.ts) does this (with
in-isolate caching, so repeated tool calls don't re-login):

```ts
import {
  getVtexIdSessionToken,
  vtexIdCookieHeader,
} from "../../lib/vtexid-session.ts";

const { accountName, appKey, appToken } = env.MESH_REQUEST_CONTEXT.state;
const token = await getVtexIdSessionToken({ accountName, appKey, appToken });

const res = await fetch(url, {
  headers: { Accept: "application/json", Cookie: vtexIdCookieHeader(token) },
});
```

Under the hood it does `POST /api/vtexid/apptoken/login` with
`{ appkey, apptoken }`, caches the returned token until just before its JWT
`exp`, and hands it back. `VTEX_GET_ORDERS_TREND` is the reference consumer —
reuse the helper for any other internal-endpoint tool.

## Development

### Prerequisites

- [Bun](https://bun.sh/) runtime
- Node.js >= 22.0.0

### Setup

```bash
bun install
```

### Running locally

```bash
bun run dev
```

### Regenerating tools from OpenAPI schemas

Downloads the latest schemas from VTEX's official GitHub repository and regenerates the TypeScript SDK, Zod schemas, and client code:

```bash
bun run generate
```

### Type checking

```bash
bun run check
```

### Tests

```bash
bun run test
```

### Deployment

```bash
bun run deploy
```

## Architecture

```
server/
├── main.ts                  # MCP entry point
├── types/
│   └── env.ts               # Credential schema (Zod)
├── lib/
│   ├── client-factory.ts    # Creates VTEX API clients with auth
│   ├── tool-adapter.ts      # Converts OpenAPI operations to MCP tools
│   └── vtexid-session.ts    # Mints VtexId session tokens for internal endpoints
├── tools/
│   ├── index.ts             # Tool registry (all tools exported)
│   ├── registry.ts          # Auto-generated tool definitions
│   └── custom/              # Hand-crafted multi-step tools
└── generated/               # Auto-generated from OpenAPI specs
    ├── catalog/
    ├── orders/
    ├── logistics/
    ├── pricing/
    └── ... (67 modules)
schemas/                     # VTEX OpenAPI schema JSON files
scripts/
└── download-schemas.ts      # Fetches schemas from VTEX GitHub
```

**Code generation pipeline:** VTEX OpenAPI JSON schemas are downloaded from the official repository, then [@hey-api/openapi-ts](https://github.com/hey-api/openapi-ts) generates TypeScript clients, SDK functions, and Zod request schemas. The `tool-adapter` converts each SDK operation into an MCP tool with flattened parameters and automatic type coercion.
