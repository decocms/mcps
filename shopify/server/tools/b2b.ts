/**
 * B2B & markets tools (read-only) — Shopify Plus features.
 */
import { z } from "zod";
import { DEFAULT_PAGE_SIZE } from "../constants.ts";
import { flattenConnection, shopifyGraphql } from "../lib/client.ts";
import { MONEY, PAGE_INFO } from "../lib/gql.ts";
import {
  createShopifyTool,
  paginationSchema,
  searchQuerySchema,
} from "../lib/tool.ts";

export const LIST_COMPANIES_QUERY = `
query ListCompanies($first: Int!, $after: String, $query: String) {
  companies(first: $first, after: $after, query: $query) {
    ${PAGE_INFO}
    nodes {
      id
      name
      externalId
      note
      createdAt
      updatedAt
      customerSince
      lifetimeDuration
      ordersCount { count }
      contactsCount { count }
      locationsCount { count }
      totalSpent ${MONEY}
      mainContact {
        id
        customer { id displayName defaultEmailAddress { emailAddress } }
      }
    }
  }
}`;

export const listCompanies = createShopifyTool({
  id: "SHOPIFY_LIST_COMPANIES",
  description:
    "List B2B company accounts with contacts/locations counts and total spend (Shopify Plus).",
  inputSchema: z.object({
    ...paginationSchema,
    query: searchQuerySchema,
  }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ companies: unknown }>(
      creds,
      LIST_COMPANIES_QUERY,
      {
        first: input.first ?? DEFAULT_PAGE_SIZE,
        after: input.after,
        query: input.query,
      },
      "SHOPIFY_LIST_COMPANIES",
    );
    return { companies: flattenConnection(data.companies) };
  },
});

export const LIST_MARKETS_QUERY = `
query ListMarkets($first: Int!, $after: String) {
  markets(first: $first, after: $after) {
    ${PAGE_INFO}
    nodes {
      id
      name
      handle
      status
      type
      currencySettings {
        baseCurrency { currencyCode currencyName }
        localCurrencies
      }
      webPresences(first: 5) {
        nodes {
          id
          domain { host }
          defaultLocale { locale }
          subfolderSuffix
        }
      }
    }
  }
}`;

export const listMarkets = createShopifyTool({
  id: "SHOPIFY_LIST_MARKETS",
  description:
    "List markets (international selling regions) with currency settings and web presences.",
  inputSchema: z.object({ ...paginationSchema }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ markets: unknown }>(
      creds,
      LIST_MARKETS_QUERY,
      { first: input.first ?? DEFAULT_PAGE_SIZE, after: input.after },
      "SHOPIFY_LIST_MARKETS",
    );
    return { markets: flattenConnection(data.markets) };
  },
});

export const b2bTools = [listCompanies, listMarkets];
