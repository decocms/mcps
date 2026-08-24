/**
 * Shared enum constants mirrored from the Wake Storefront GraphQL schema.
 */

/** ProductSortKeys — sort keys for product listing (`products`, `hotsite`). */
export const PRODUCT_SORT_KEYS = [
  "NAME",
  "SALES",
  "PRICE",
  "DISCOUNT",
  "RANDOM",
  "RELEASE_DATE",
  "STOCK",
] as const;

/** ProductSearchSortKeys — sort keys for full-text `search`, adds RELEVANCE. */
export const SEARCH_SORT_KEYS = ["RELEVANCE", ...PRODUCT_SORT_KEYS] as const;
