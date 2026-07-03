/**
 * Magento searchCriteria helpers.
 *
 * Magento list endpoints take filters as bracket-indexed query params
 * (`searchCriteria[filter_groups][0][filters][0][field]=...`). Tools expose a
 * clean `filters` array instead and this module translates it. Filters are
 * combined with AND (each filter becomes its own filter group); filters inside
 * the same group would be OR — not needed for v1.
 */
import { z } from "zod";

export const CONDITION_TYPES = [
  "eq",
  "neq",
  "gt",
  "gteq",
  "lt",
  "lteq",
  "like",
  "in",
  "nin",
  "null",
  "notnull",
] as const;

export const filterSchema = z.object({
  field: z
    .string()
    .describe(
      'Order/entity attribute to filter on, e.g. "created_at", "status", "sku"',
    ),
  value: z
    .string()
    .describe(
      'Filter value. Dates are UTC "YYYY-MM-DD HH:MM:SS". For "in"/"nin" use a comma-separated list. For "like" include % wildcards.',
    ),
  conditionType: z
    .enum(CONDITION_TYPES)
    .optional()
    .describe('Magento condition type (default "eq")'),
});

export type SearchFilter = z.infer<typeof filterSchema>;

export const filtersSchema = z
  .array(filterSchema)
  .optional()
  .describe("Filters combined with AND (each becomes its own filter group)");

export interface SortOrder {
  field: string;
  direction: "ASC" | "DESC";
}

export interface SearchCriteriaOptions {
  filters?: SearchFilter[];
  sortOrders?: SortOrder[];
  pageSize?: number;
  currentPage?: number;
  /**
   * Magento response field trimming, e.g.
   * "total_count,items[increment_id,status,grand_total,created_at]".
   */
  fields?: string;
}

export function buildSearchCriteriaParams(
  options: SearchCriteriaOptions = {},
): URLSearchParams {
  const params = new URLSearchParams();

  (options.filters ?? []).forEach((filter, index) => {
    const prefix = `searchCriteria[filter_groups][${index}][filters][0]`;
    params.set(`${prefix}[field]`, filter.field);
    params.set(`${prefix}[value]`, filter.value);
    params.set(`${prefix}[condition_type]`, filter.conditionType ?? "eq");
  });

  (options.sortOrders ?? []).forEach((sort, index) => {
    params.set(`searchCriteria[sortOrders][${index}][field]`, sort.field);
    params.set(
      `searchCriteria[sortOrders][${index}][direction]`,
      sort.direction,
    );
  });

  // Magento requires at least one searchCriteria param on search endpoints.
  params.set("searchCriteria[pageSize]", String(options.pageSize ?? 20));
  if (options.currentPage !== undefined) {
    params.set("searchCriteria[currentPage]", String(options.currentPage));
  }
  if (options.fields) {
    params.set("fields", options.fields);
  }

  return params;
}
