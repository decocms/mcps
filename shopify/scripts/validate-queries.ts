#!/usr/bin/env bun
/**
 * Validates every GraphQL document against the Shopify Admin API schema via
 * shopify.dev's GraphiQL proxy (no store/token needed — it executes queries
 * against demo data and reports full validation errors).
 *
 * Usage: bun run scripts/validate-queries.ts [--version 2026-07]
 */
import * as analytics from "../server/tools/analytics.ts";
import * as b2b from "../server/tools/b2b.ts";
import * as content from "../server/tools/content.ts";
import * as customers from "../server/tools/customers.ts";
import * as discounts from "../server/tools/discounts.ts";
import * as fulfillment from "../server/tools/fulfillment.ts";
import * as inventory from "../server/tools/inventory.ts";
import * as orders from "../server/tools/orders.ts";
import * as payments from "../server/tools/payments.ts";
import * as products from "../server/tools/products.ts";
import * as store from "../server/tools/store.ts";
import { DEFAULT_API_VERSION } from "../server/constants.ts";

const version =
  process.argv.includes("--version") &&
  process.argv[process.argv.indexOf("--version") + 1]
    ? process.argv[process.argv.indexOf("--version") + 1]
    : DEFAULT_API_VERSION;

const PROXY_URL = `https://shopify.dev/admin-graphql-direct-proxy/${version}`;

const GID = {
  product: "gid://shopify/Product/1",
  collection: "gid://shopify/Collection/1",
  order: "gid://shopify/Order/1",
  draftOrder: "gid://shopify/DraftOrder/1",
  customer: "gid://shopify/Customer/1",
  segment: "gid://shopify/Segment/1",
  inventoryItem: "gid://shopify/InventoryItem/1",
  productVariant: "gid://shopify/ProductVariant/1",
  location: "gid://shopify/Location/1",
  discountNode: "gid://shopify/DiscountNode/1",
  theme: "gid://shopify/OnlineStoreTheme/1",
  lineItem: "gid://shopify/LineItem/1",
};

/** Sample variables per exported *_QUERY document. */
const SAMPLES: Record<string, Record<string, unknown>> = {
  LIST_PRODUCTS_QUERY: { first: 1 },
  GET_PRODUCT_BY_ID_QUERY: { id: GID.product },
  GET_PRODUCT_BY_HANDLE_QUERY: { handle: "sample" },
  LIST_PRODUCT_VARIANTS_QUERY: { first: 1 },
  LIST_COLLECTIONS_QUERY: { first: 1 },
  GET_COLLECTION_BY_ID_QUERY: { id: GID.collection, productsFirst: 1 },
  GET_COLLECTION_BY_HANDLE_QUERY: { handle: "sample", productsFirst: 1 },
  LIST_PUBLICATIONS_QUERY: { first: 1 },
  LIST_ORDERS_QUERY: { first: 1 },
  GET_ORDER_QUERY: { id: GID.order },
  LIST_DRAFT_ORDERS_QUERY: { first: 1 },
  GET_DRAFT_ORDER_QUERY: { id: GID.draftOrder },
  LIST_ABANDONED_CHECKOUTS_QUERY: { first: 1 },
  CALCULATE_REFUND_QUERY: {
    orderId: GID.order,
    refundLineItems: [{ lineItemId: GID.lineItem, quantity: 1 }],
  },
  LIST_RETURNS_QUERY: { orderId: GID.order, first: 1 },
  LIST_FULFILLMENT_ORDERS_QUERY: { orderId: GID.order, first: 1 },
  LIST_LOCATIONS_QUERY: { first: 1 },
  LIST_CARRIER_SERVICES_QUERY: { first: 1 },
  INVENTORY_LEVELS_BY_ITEM_QUERY: {
    itemId: GID.inventoryItem,
    first: 1,
    names: ["available"],
  },
  INVENTORY_LEVELS_BY_VARIANT_QUERY: {
    variantId: GID.productVariant,
    first: 1,
    names: ["available"],
  },
  INVENTORY_LEVELS_BY_LOCATION_QUERY: {
    locationId: GID.location,
    first: 1,
    names: ["available"],
  },
  GET_INVENTORY_ITEM_QUERY: { id: GID.inventoryItem },
  LIST_CUSTOMERS_QUERY: { first: 1 },
  GET_CUSTOMER_QUERY: { id: GID.customer },
  GET_CUSTOMER_ORDERS_QUERY: { id: GID.customer, first: 1 },
  LIST_SEGMENTS_QUERY: { first: 1 },
  LIST_SEGMENT_MEMBERS_QUERY: { segmentId: GID.segment, first: 1 },
  LIST_DISCOUNTS_QUERY: { first: 1 },
  GET_DISCOUNT_QUERY: { id: GID.discountNode },
  LIST_MARKETING_ACTIVITIES_QUERY: { first: 1 },
  LIST_PAGES_QUERY: { first: 1 },
  LIST_BLOGS_QUERY: { first: 1 },
  LIST_ARTICLES_QUERY: { first: 1 },
  LIST_MENUS_QUERY: { first: 1 },
  LIST_REDIRECTS_QUERY: { first: 1 },
  LIST_THEMES_QUERY: { first: 1 },
  GET_THEME_FILES_QUERY: { id: GID.theme, first: 1 },
  GET_SHOP_INFO_QUERY: {},
  LIST_LOCALES_QUERY: {},
  GET_TRANSLATIONS_QUERY: {
    resourceType: "PRODUCT",
    locale: "pt-BR",
    first: 1,
  },
  LIST_STAFF_QUERY: { first: 1 },
  LIST_EVENTS_QUERY: { first: 1 },
  LIST_COMPANIES_QUERY: { first: 1 },
  LIST_MARKETS_QUERY: { first: 1 },
  LIST_PAYOUTS_QUERY: { first: 1 },
  GET_PAYMENTS_BALANCE_QUERY: {},
  LIST_DISPUTES_QUERY: { first: 1 },
  LIST_BALANCE_TRANSACTIONS_QUERY: { first: 1 },
  RUN_SHOPIFYQL_QUERY: { query: "FROM sales SHOW total_sales SINCE -7d" },
};

const modules = {
  products,
  orders,
  fulfillment,
  inventory,
  customers,
  discounts,
  content,
  store,
  b2b,
  payments,
  analytics,
};

interface Doc {
  name: string;
  module: string;
  query: string;
}

const docs: Doc[] = [];
for (const [moduleName, mod] of Object.entries(modules)) {
  for (const [exportName, value] of Object.entries(mod)) {
    if (exportName.endsWith("_QUERY") && typeof value === "string") {
      docs.push({ name: exportName, module: moduleName, query: value });
    }
  }
}

// The includeBody variants built at runtime by content.ts handlers.
docs.push({
  name: "LIST_PAGES_QUERY(includeBody)",
  module: "content",
  query: content.LIST_PAGES_QUERY.replace(
    "bodySummary",
    "bodySummary\n      body",
  ),
});
docs.push({
  name: "LIST_ARTICLES_QUERY(includeBody)",
  module: "content",
  query: content.LIST_ARTICLES_QUERY.replace("summary", "summary\n      body"),
});

/** Errors that indicate a schema mismatch (vs runtime/data errors, which are fine here). */
const VALIDATION_ERROR_PATTERN =
  /doesn't exist on type|Cannot query field|Unknown argument|has no argument|was provided invalid value|expected type|Fragment .* was used, but not defined|can't be blank|Variable .* of type|must be an input type|isn't a defined input type|Field must have selections|selections on scalar|No such type/i;

let failures = 0;
let warnings = 0;

for (const doc of docs) {
  const baseName = doc.name.replace(/\(.*\)$/, "");
  const variables = SAMPLES[baseName];
  if (!variables) {
    console.log(`⚠️  ${doc.name}: no sample variables registered — skipping`);
    warnings++;
    continue;
  }

  const response = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: doc.query, variables }),
  });

  if (!response.ok) {
    console.log(`❌ ${doc.name}: HTTP ${response.status}`);
    failures++;
    continue;
  }

  const payload = (await response.json()) as {
    errors?: { message: string }[];
  };

  if (!payload.errors?.length) {
    console.log(`✅ ${doc.name}`);
    continue;
  }

  const messages = payload.errors.map((e) => e.message);
  const isValidationError = messages.some((m) =>
    VALIDATION_ERROR_PATTERN.test(m),
  );
  if (isValidationError) {
    console.log(`❌ ${doc.name}:`);
    for (const m of messages) console.log(`     ${m}`);
    failures++;
  } else {
    console.log(`⚠️  ${doc.name} (runtime error, likely fine on real stores):`);
    for (const m of messages) console.log(`     ${m}`);
    warnings++;
  }
}

console.log(
  `\n${docs.length} documents checked against ${version}: ${docs.length - failures - warnings} ok, ${warnings} warnings, ${failures} failures`,
);
process.exit(failures > 0 ? 1 : 0);
