/**
 * Shared paginated /V1/orders fetch + in-memory aggregation helpers used by
 * the analytics tools (timeline, sales card, cancellation rate, top products,
 * status breakdown).
 */
import { magentoFetch, type MagentoCredentials } from "../../lib/client.ts";
import {
  buildSearchCriteriaParams,
  type SearchFilter,
} from "../../lib/search-criteria.ts";
import {
  getHourIndex,
  parseMagentoUtc,
  toMagentoUtc,
  type TimeWindow,
} from "../../lib/time.ts";

export interface MagentoOrderLineItem {
  sku?: string;
  name?: string;
  qty_ordered?: number;
  row_total?: number;
  parent_item_id?: number | null;
  product_type?: string;
}

export interface MagentoOrderSummary {
  increment_id?: string;
  status?: string;
  state?: string;
  grand_total?: number;
  created_at?: string;
  items?: MagentoOrderLineItem[];
}

export interface OrdersSearchPage {
  items?: MagentoOrderSummary[];
  total_count?: number;
}

/** Response trimming — keeps each order at ~80 bytes. */
export const ORDER_SUMMARY_FIELDS =
  "total_count,items[increment_id,status,state,grand_total,created_at]";

/** Summary + line items, for product-level aggregation. */
export const ORDER_WITH_LINES_FIELDS =
  "total_count,items[increment_id,status,state,grand_total,created_at,items[sku,name,qty_ordered,row_total,parent_item_id,product_type]]";

const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_MAX_PAGES = 20;

export interface SearchOrdersResult {
  items: MagentoOrderSummary[];
  totalCount: number;
  /** True when total_count exceeded the pagination cap — numbers may be partial. */
  truncated: boolean;
}

export interface SearchOrdersOptions {
  creds: MagentoCredentials;
  window: TimeWindow;
  extraFilters?: SearchFilter[];
  fields?: string;
  pageSize?: number;
  maxPages?: number;
  toolId?: string;
}

export async function searchOrders(
  options: SearchOrdersOptions,
): Promise<SearchOrdersResult> {
  const {
    creds,
    window,
    extraFilters = [],
    fields = ORDER_SUMMARY_FIELDS,
    pageSize = DEFAULT_PAGE_SIZE,
    maxPages = DEFAULT_MAX_PAGES,
    toolId,
  } = options;

  const filters: SearchFilter[] = [
    {
      field: "created_at",
      value: toMagentoUtc(window.startUtc),
      conditionType: "gteq",
    },
    {
      field: "created_at",
      value: toMagentoUtc(window.endUtc),
      conditionType: "lteq",
    },
    ...extraFilters,
  ];

  const items: MagentoOrderSummary[] = [];
  let totalCount = 0;

  for (let currentPage = 1; currentPage <= maxPages; currentPage++) {
    const params = buildSearchCriteriaParams({
      filters,
      sortOrders: [{ field: "created_at", direction: "ASC" }],
      pageSize,
      currentPage,
      fields,
    });
    const page = await magentoFetch<OrdersSearchPage>(creds, "/orders", {
      params,
      toolId,
    });

    const pageItems = page.items ?? [];
    items.push(...pageItems);
    totalCount = page.total_count ?? items.length;

    if (pageItems.length === 0 || items.length >= totalCount) break;
  }

  return { items, totalCount, truncated: items.length < totalCount };
}

/** Cheap exact count — single request with pageSize=1 and total_count only. */
export async function countOrders(
  creds: MagentoCredentials,
  filters: SearchFilter[],
  toolId?: string,
): Promise<number> {
  const params = buildSearchCriteriaParams({
    filters,
    pageSize: 1,
    fields: "total_count",
  });
  const page = await magentoFetch<OrdersSearchPage>(creds, "/orders", {
    params,
    toolId,
  });
  return page.total_count ?? 0;
}

// ── Aggregations ─────────────────────────────────────────────────────────────

export interface HourlyOrderBucket {
  hour: string;
  count: number;
  totalValue: number;
}

/** Bucket orders into 24 local hours (zero-filled). */
export function aggregateHourlyBuckets(
  orders: MagentoOrderSummary[],
  dayStartMs: number,
): HourlyOrderBucket[] {
  const buckets = Array.from({ length: 24 }, (_, index) => ({
    hour: `${String(index).padStart(2, "0")}:00`,
    count: 0,
    totalValue: 0,
  }));

  for (const order of orders) {
    if (!order.created_at) continue;
    const createdMs = parseMagentoUtc(order.created_at);
    if (Number.isNaN(createdMs)) continue;
    const bucket = buckets[getHourIndex(createdMs, dayStartMs)];
    bucket.count += 1;
    bucket.totalValue += order.grand_total ?? 0;
  }

  return buckets;
}

export interface PeriodStats {
  orders: number;
  totalValue: number;
}

/** Count + grand_total sum of orders created at or after `startMs`. */
export function aggregateWindowStats(
  orders: MagentoOrderSummary[],
  startMs: number,
): PeriodStats {
  let count = 0;
  let totalValue = 0;
  for (const order of orders) {
    if (!order.created_at) continue;
    const createdMs = parseMagentoUtc(order.created_at);
    if (Number.isNaN(createdMs) || createdMs < startMs) continue;
    count += 1;
    totalValue += order.grand_total ?? 0;
  }
  return { orders: count, totalValue };
}

export interface StatusBucket {
  status: string;
  count: number;
  totalValue: number;
}

export function aggregateByStatus(
  orders: MagentoOrderSummary[],
): StatusBucket[] {
  const byStatus = new Map<string, StatusBucket>();
  for (const order of orders) {
    const status = order.status ?? "unknown";
    const bucket = byStatus.get(status) ?? { status, count: 0, totalValue: 0 };
    bucket.count += 1;
    bucket.totalValue += order.grand_total ?? 0;
    byStatus.set(status, bucket);
  }
  return [...byStatus.values()].sort((a, b) => b.count - a.count);
}

export interface ProductAggregate {
  sku: string;
  name: string;
  quantity: number;
  revenue: number;
  orders: number;
}

/**
 * Aggregate line items by SKU. Only top-level items count (children of
 * configurable/bundle parents carry parent_item_id and would double-count).
 */
export function aggregateTopProducts(
  orders: MagentoOrderSummary[],
  limit: number,
): ProductAggregate[] {
  const bySku = new Map<string, ProductAggregate>();

  for (const order of orders) {
    for (const item of order.items ?? []) {
      if (item.parent_item_id != null) continue;
      const sku = item.sku ?? "unknown";
      const aggregate = bySku.get(sku) ?? {
        sku,
        name: item.name ?? sku,
        quantity: 0,
        revenue: 0,
        orders: 0,
      };
      aggregate.quantity += item.qty_ordered ?? 0;
      aggregate.revenue += item.row_total ?? 0;
      aggregate.orders += 1;
      bySku.set(sku, aggregate);
    }
  }

  return [...bySku.values()]
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
    .slice(0, limit);
}
