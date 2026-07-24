/**
 * Store properties & localization tools (read-only): shop info, locales,
 * translations, staff and audit events.
 */
import { z } from "zod";
import { DEFAULT_PAGE_SIZE } from "../constants.ts";
import { flattenConnection, shopifyGraphql } from "../lib/client.ts";
import { PAGE_INFO } from "../lib/gql.ts";
import {
  createShopifyTool,
  paginationSchema,
  searchQuerySchema,
} from "../lib/tool.ts";

export const GET_SHOP_INFO_QUERY = `
query GetShopInfo {
  shop {
    id
    name
    email
    contactEmail
    description
    url
    myshopifyDomain
    primaryDomain { host url sslEnabled }
    currencyCode
    enabledPresentmentCurrencies
    ianaTimezone
    timezoneAbbreviation
    weightUnit
    unitSystem
    taxesIncluded
    taxShipping
    checkoutApiSupported
    setupRequired
    shopOwnerName
    createdAt
    updatedAt
    plan { publicDisplayName shopifyPlus partnerDevelopment }
    billingAddress { address1 city province country zip phone }
    shipsToCountries
  }
}`;

export const getShopInfo = createShopifyTool({
  id: "SHOPIFY_GET_SHOP_INFO",
  description:
    "Get store info: name, domains, plan, currency, timezone, contact and settings. Also works as a connection test.",
  inputSchema: z.object({}),
  handler: async (_input, creds) => {
    const data = await shopifyGraphql<{ shop: unknown }>(
      creds,
      GET_SHOP_INFO_QUERY,
      {},
      "SHOPIFY_GET_SHOP_INFO",
    );
    return { shop: data.shop };
  },
});

export const LIST_LOCALES_QUERY = `
query ListLocales {
  shopLocales {
    locale
    name
    primary
    published
  }
}`;

export const listLocales = createShopifyTool({
  id: "SHOPIFY_LIST_LOCALES",
  description: "List the languages (locales) enabled on the store.",
  inputSchema: z.object({}),
  handler: async (_input, creds) => {
    const data = await shopifyGraphql<{ shopLocales: unknown }>(
      creds,
      LIST_LOCALES_QUERY,
      {},
      "SHOPIFY_LIST_LOCALES",
    );
    return { locales: data.shopLocales };
  },
});

export const GET_TRANSLATIONS_QUERY = `
query GetTranslations($resourceType: TranslatableResourceType!, $locale: String!, $first: Int!, $after: String) {
  translatableResources(resourceType: $resourceType, first: $first, after: $after) {
    ${PAGE_INFO}
    nodes {
      resourceId
      translatableContent { key value digest locale }
      translations(locale: $locale) { key value locale outdated }
    }
  }
}`;

export const getTranslations = createShopifyTool({
  id: "SHOPIFY_GET_TRANSLATIONS",
  description:
    "Read translatable content and its translations for a resource type (PRODUCT, COLLECTION, ONLINE_STORE_PAGE, ONLINE_STORE_ARTICLE, ONLINE_STORE_MENU, SHOP_POLICY…) in a target locale.",
  inputSchema: z.object({
    resourceType: z
      .string()
      .describe(
        "TranslatableResourceType enum value, e.g. PRODUCT, COLLECTION, ONLINE_STORE_PAGE, ONLINE_STORE_ARTICLE, ONLINE_STORE_MENU, SHOP, SHOP_POLICY, METAOBJECT",
      ),
    locale: z
      .string()
      .describe('Target locale to read translations for, e.g. "pt-BR"'),
    ...paginationSchema,
  }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ translatableResources: unknown }>(
      creds,
      GET_TRANSLATIONS_QUERY,
      {
        resourceType: input.resourceType.toUpperCase(),
        locale: input.locale,
        first: input.first ?? DEFAULT_PAGE_SIZE,
        after: input.after,
      },
      "SHOPIFY_GET_TRANSLATIONS",
    );
    return {
      translatableResources: flattenConnection(data.translatableResources),
    };
  },
});

export const LIST_STAFF_QUERY = `
query ListStaff($first: Int!, $after: String) {
  staffMembers(first: $first, after: $after) {
    ${PAGE_INFO}
    nodes {
      id
      name
      firstName
      lastName
      email
      active
      isShopOwner
      accountType
      locale
    }
  }
}`;

export const listStaff = createShopifyTool({
  id: "SHOPIFY_LIST_STAFF",
  description:
    "List staff accounts (name, email, active, owner flag). Requires the read_users scope.",
  inputSchema: z.object({ ...paginationSchema }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ staffMembers: unknown }>(
      creds,
      LIST_STAFF_QUERY,
      { first: input.first ?? DEFAULT_PAGE_SIZE, after: input.after },
      "SHOPIFY_LIST_STAFF",
    );
    return { staffMembers: flattenConnection(data.staffMembers) };
  },
});

export const LIST_EVENTS_QUERY = `
query ListEvents($first: Int!, $after: String, $query: String, $sortKey: EventSortKeys, $reverse: Boolean) {
  events(first: $first, after: $after, query: $query, sortKey: $sortKey, reverse: $reverse) {
    ${PAGE_INFO}
    nodes {
      id
      createdAt
      action
      message
      appTitle
      attributeToApp
      attributeToUser
      criticalAlert
      ... on BasicEvent {
        subjectId
        subjectType
        secondaryMessage
      }
    }
  }
}`;

export const listEvents = createShopifyTool({
  id: "SHOPIFY_LIST_EVENTS",
  description:
    'List timeline/audit events across the store (product updates, order actions…). Supports filters like "subject_type:PRODUCT created_at:>=2026-07-01".',
  inputSchema: z.object({
    ...paginationSchema,
    query: searchQuerySchema,
    sortKey: z
      .enum(["CREATED_AT", "ID"])
      .optional()
      .describe("Sort key (default ID)"),
    reverse: z.boolean().optional().describe("Reverse the sort order"),
  }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ events: unknown }>(
      creds,
      LIST_EVENTS_QUERY,
      {
        first: input.first ?? DEFAULT_PAGE_SIZE,
        after: input.after,
        query: input.query,
        sortKey: input.sortKey,
        reverse: input.reverse,
      },
      "SHOPIFY_LIST_EVENTS",
    );
    return { events: flattenConnection(data.events) };
  },
});

export const storeTools = [
  getShopInfo,
  listLocales,
  getTranslations,
  listStaff,
  listEvents,
];
