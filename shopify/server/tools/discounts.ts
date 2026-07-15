/**
 * Discounts & marketing tools (read-only).
 */
import { z } from "zod";
import { DEFAULT_PAGE_SIZE } from "../constants.ts";
import { flattenConnection, shopifyGraphql, toGid } from "../lib/client.ts";
import { MONEY, PAGE_INFO } from "../lib/gql.ts";
import {
  createShopifyTool,
  paginationSchema,
  searchQuerySchema,
} from "../lib/tool.ts";

const CODE_DISCOUNT_FIELDS = `
  title
  status
  summary
  startsAt
  endsAt
  asyncUsageCount
  usageLimit
  codes(first: 5) { nodes { code } }
  codesCount { count }
`;

const AUTOMATIC_DISCOUNT_FIELDS = `
  title
  status
  summary
  startsAt
  endsAt
  asyncUsageCount
`;

const DISCOUNT_SELECTION = `
  __typename
  ... on DiscountCodeBasic { ${CODE_DISCOUNT_FIELDS} }
  ... on DiscountCodeBxgy { ${CODE_DISCOUNT_FIELDS} }
  ... on DiscountCodeFreeShipping { ${CODE_DISCOUNT_FIELDS} }
  ... on DiscountCodeApp { title status startsAt endsAt asyncUsageCount usageLimit codes(first: 5) { nodes { code } } }
  ... on DiscountAutomaticBasic { ${AUTOMATIC_DISCOUNT_FIELDS} }
  ... on DiscountAutomaticBxgy { ${AUTOMATIC_DISCOUNT_FIELDS} }
  ... on DiscountAutomaticFreeShipping { ${AUTOMATIC_DISCOUNT_FIELDS} }
  ... on DiscountAutomaticApp { title status startsAt endsAt asyncUsageCount }
`;

export const LIST_DISCOUNTS_QUERY = `
query ListDiscounts($first: Int!, $after: String, $query: String) {
  discountNodes(first: $first, after: $after, query: $query) {
    ${PAGE_INFO}
    nodes {
      id
      discount {
        ${DISCOUNT_SELECTION}
      }
    }
  }
}`;

export const listDiscounts = createShopifyTool({
  id: "SHOPIFY_LIST_DISCOUNTS",
  description:
    'List all discounts — code and automatic — with status, dates, usage counts and codes. Supports filters like "status:active" or "type:code_discount".',
  inputSchema: z.object({
    ...paginationSchema,
    query: searchQuerySchema,
  }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ discountNodes: unknown }>(
      creds,
      LIST_DISCOUNTS_QUERY,
      {
        first: input.first ?? DEFAULT_PAGE_SIZE,
        after: input.after,
        query: input.query,
      },
      "SHOPIFY_LIST_DISCOUNTS",
    );
    return { discounts: flattenConnection(data.discountNodes) };
  },
});

const COMBINES_WITH = `combinesWith { orderDiscounts productDiscounts shippingDiscounts }`;

export const GET_DISCOUNT_QUERY = `
query GetDiscount($id: ID!) {
  discountNode(id: $id) {
    id
    discount {
      __typename
      ... on DiscountCodeBasic { ${CODE_DISCOUNT_FIELDS} appliesOncePerCustomer recurringCycleLimit totalSales ${MONEY} ${COMBINES_WITH} }
      ... on DiscountCodeBxgy { ${CODE_DISCOUNT_FIELDS} appliesOncePerCustomer ${COMBINES_WITH} }
      ... on DiscountCodeFreeShipping { ${CODE_DISCOUNT_FIELDS} appliesOncePerCustomer recurringCycleLimit ${COMBINES_WITH} }
      ... on DiscountCodeApp { title status startsAt endsAt asyncUsageCount usageLimit codes(first: 5) { nodes { code } } ${COMBINES_WITH} }
      ... on DiscountAutomaticBasic { ${AUTOMATIC_DISCOUNT_FIELDS} recurringCycleLimit ${COMBINES_WITH} }
      ... on DiscountAutomaticBxgy { ${AUTOMATIC_DISCOUNT_FIELDS} ${COMBINES_WITH} }
      ... on DiscountAutomaticFreeShipping { ${AUTOMATIC_DISCOUNT_FIELDS} recurringCycleLimit ${COMBINES_WITH} }
      ... on DiscountAutomaticApp { title status startsAt endsAt asyncUsageCount ${COMBINES_WITH} }
    }
  }
}`;

export const getDiscount = createShopifyTool({
  id: "SHOPIFY_GET_DISCOUNT",
  description:
    "Fetch one discount by ID with rules, usage counts, codes and combination settings.",
  inputSchema: z.object({
    id: z
      .string()
      .describe(
        'Discount node ID — numeric or GID ("gid://shopify/DiscountNode/123")',
      ),
  }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ discountNode: unknown }>(
      creds,
      GET_DISCOUNT_QUERY,
      { id: toGid("DiscountNode", input.id) },
      "SHOPIFY_GET_DISCOUNT",
    );
    if (!data.discountNode) {
      throw new Error(`Discount not found: ${input.id}`);
    }
    return { discount: data.discountNode };
  },
});

export const LIST_MARKETING_ACTIVITIES_QUERY = `
query ListMarketingActivities($first: Int!, $after: String) {
  marketingActivities(first: $first, after: $after) {
    ${PAGE_INFO}
    nodes {
      id
      title
      status
      statusLabel
      tactic
      marketingChannelType
      createdAt
      updatedAt
      adSpend ${MONEY}
      budget { budgetType total ${MONEY} }
      utmParameters { campaign source medium }
    }
  }
}`;

export const listMarketingActivities = createShopifyTool({
  id: "SHOPIFY_LIST_MARKETING_ACTIVITIES",
  description:
    "List marketing activities (campaigns) with status, channel, budget and UTM parameters.",
  inputSchema: z.object({ ...paginationSchema }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ marketingActivities: unknown }>(
      creds,
      LIST_MARKETING_ACTIVITIES_QUERY,
      { first: input.first ?? DEFAULT_PAGE_SIZE, after: input.after },
      "SHOPIFY_LIST_MARKETING_ACTIVITIES",
    );
    return {
      marketingActivities: flattenConnection(data.marketingActivities),
    };
  },
});

export const discountTools = [
  listDiscounts,
  getDiscount,
  listMarketingActivities,
];
