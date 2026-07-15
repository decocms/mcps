/**
 * Online store content tools (read-only): pages, blogs, articles, menus,
 * redirects and themes.
 */
import { z } from "zod";
import { DEFAULT_PAGE_SIZE } from "../constants.ts";
import { flattenConnection, shopifyGraphql, toGid } from "../lib/client.ts";
import { PAGE_INFO } from "../lib/gql.ts";
import {
  createShopifyTool,
  paginationSchema,
  searchQuerySchema,
} from "../lib/tool.ts";

export const LIST_PAGES_QUERY = `
query ListPages($first: Int!, $after: String, $query: String) {
  pages(first: $first, after: $after, query: $query) {
    ${PAGE_INFO}
    nodes {
      id
      title
      handle
      bodySummary
      isPublished
      publishedAt
      createdAt
      updatedAt
      templateSuffix
    }
  }
}`;

export const listPages = createShopifyTool({
  id: "SHOPIFY_LIST_PAGES",
  description:
    "List online store pages (title, handle, body summary, publish state).",
  inputSchema: z.object({
    ...paginationSchema,
    query: searchQuerySchema,
    includeBody: z
      .boolean()
      .optional()
      .describe("Include the full HTML body of each page"),
  }),
  handler: async (input, creds) => {
    const query = input.includeBody
      ? LIST_PAGES_QUERY.replace("bodySummary", "bodySummary\n      body")
      : LIST_PAGES_QUERY;
    const data = await shopifyGraphql<{ pages: unknown }>(
      creds,
      query,
      {
        first: input.first ?? DEFAULT_PAGE_SIZE,
        after: input.after,
        query: input.query,
      },
      "SHOPIFY_LIST_PAGES",
    );
    return { pages: flattenConnection(data.pages) };
  },
});

export const LIST_BLOGS_QUERY = `
query ListBlogs($first: Int!, $after: String) {
  blogs(first: $first, after: $after) {
    ${PAGE_INFO}
    nodes {
      id
      title
      handle
      commentPolicy
      createdAt
      updatedAt
      tags
      articlesCount { count }
    }
  }
}`;

export const listBlogs = createShopifyTool({
  id: "SHOPIFY_LIST_BLOGS",
  description: "List the store's blogs.",
  inputSchema: z.object({ ...paginationSchema }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ blogs: unknown }>(
      creds,
      LIST_BLOGS_QUERY,
      { first: input.first ?? DEFAULT_PAGE_SIZE, after: input.after },
      "SHOPIFY_LIST_BLOGS",
    );
    return { blogs: flattenConnection(data.blogs) };
  },
});

export const LIST_ARTICLES_QUERY = `
query ListArticles($first: Int!, $after: String, $query: String) {
  articles(first: $first, after: $after, query: $query) {
    ${PAGE_INFO}
    nodes {
      id
      title
      handle
      summary
      tags
      isPublished
      publishedAt
      createdAt
      updatedAt
      templateSuffix
      author { name }
      blog { id title handle }
      image { url altText }
      commentsCount { count }
    }
  }
}`;

export const listArticles = createShopifyTool({
  id: "SHOPIFY_LIST_ARTICLES",
  description:
    "List blog posts across all blogs (author, tags, publish state). Use includeBody for full HTML content.",
  inputSchema: z.object({
    ...paginationSchema,
    query: searchQuerySchema,
    includeBody: z
      .boolean()
      .optional()
      .describe("Include the full HTML body of each article"),
  }),
  handler: async (input, creds) => {
    const query = input.includeBody
      ? LIST_ARTICLES_QUERY.replace("summary", "summary\n      body")
      : LIST_ARTICLES_QUERY;
    const data = await shopifyGraphql<{ articles: unknown }>(
      creds,
      query,
      {
        first: input.first ?? DEFAULT_PAGE_SIZE,
        after: input.after,
        query: input.query,
      },
      "SHOPIFY_LIST_ARTICLES",
    );
    return { articles: flattenConnection(data.articles) };
  },
});

export const LIST_MENUS_QUERY = `
query ListMenus($first: Int!, $after: String) {
  menus(first: $first, after: $after) {
    ${PAGE_INFO}
    nodes {
      id
      title
      handle
      isDefault
      items {
        id
        title
        type
        url
        items {
          id
          title
          type
          url
          items { id title type url }
        }
      }
    }
  }
}`;

export const listMenus = createShopifyTool({
  id: "SHOPIFY_LIST_MENUS",
  description: "List navigation menus with up to three levels of items.",
  inputSchema: z.object({ ...paginationSchema }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ menus: unknown }>(
      creds,
      LIST_MENUS_QUERY,
      { first: input.first ?? DEFAULT_PAGE_SIZE, after: input.after },
      "SHOPIFY_LIST_MENUS",
    );
    return { menus: flattenConnection(data.menus) };
  },
});

export const LIST_REDIRECTS_QUERY = `
query ListRedirects($first: Int!, $after: String, $query: String) {
  urlRedirects(first: $first, after: $after, query: $query) {
    ${PAGE_INFO}
    nodes {
      id
      path
      target
    }
  }
}`;

export const listRedirects = createShopifyTool({
  id: "SHOPIFY_LIST_REDIRECTS",
  description: "List URL redirects (path → target).",
  inputSchema: z.object({
    ...paginationSchema,
    query: searchQuerySchema,
  }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ urlRedirects: unknown }>(
      creds,
      LIST_REDIRECTS_QUERY,
      {
        first: input.first ?? DEFAULT_PAGE_SIZE,
        after: input.after,
        query: input.query,
      },
      "SHOPIFY_LIST_REDIRECTS",
    );
    return { redirects: flattenConnection(data.urlRedirects) };
  },
});

export const LIST_THEMES_QUERY = `
query ListThemes($first: Int!, $roles: [ThemeRole!]) {
  themes(first: $first, roles: $roles) {
    ${PAGE_INFO}
    nodes {
      id
      name
      role
      prefix
      processing
      processingFailed
      themeStoreId
      createdAt
      updatedAt
    }
  }
}`;

export const listThemes = createShopifyTool({
  id: "SHOPIFY_LIST_THEMES",
  description:
    "List installed themes and their roles (MAIN is the live theme).",
  inputSchema: z.object({
    first: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Results to return (default 20)"),
    roles: z
      .array(
        z.enum([
          "MAIN",
          "UNPUBLISHED",
          "DEMO",
          "DEVELOPMENT",
          "ARCHIVED",
          "LOCKED",
          "MOBILE",
        ]),
      )
      .optional()
      .describe("Filter by theme role"),
  }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ themes: unknown }>(
      creds,
      LIST_THEMES_QUERY,
      { first: input.first ?? DEFAULT_PAGE_SIZE, roles: input.roles },
      "SHOPIFY_LIST_THEMES",
    );
    return { themes: flattenConnection(data.themes) };
  },
});

export const GET_THEME_FILES_QUERY = `
query GetThemeFiles($id: ID!, $first: Int!, $after: String, $filenames: [String!]) {
  theme(id: $id) {
    id
    name
    role
    files(first: $first, after: $after, filenames: $filenames) {
      ${PAGE_INFO}
      nodes {
        filename
        size
        contentType
        checksumMd5
        createdAt
        updatedAt
        body {
          __typename
          ... on OnlineStoreThemeFileBodyText { content }
          ... on OnlineStoreThemeFileBodyBase64 { contentBase64 }
          ... on OnlineStoreThemeFileBodyUrl { url }
        }
      }
    }
  }
}`;

export const getThemeFiles = createShopifyTool({
  id: "SHOPIFY_GET_THEME_FILES",
  description:
    'Read theme files (Liquid templates, JSON settings, assets). Filter by exact filenames like ["layout/theme.liquid"] or wildcards like ["templates/*"].',
  inputSchema: z.object({
    themeId: z
      .string()
      .describe(
        'Theme ID — numeric or GID ("gid://shopify/OnlineStoreTheme/123")',
      ),
    filenames: z
      .array(z.string())
      .optional()
      .describe(
        'Filenames to fetch, supports wildcards (e.g. ["config/*", "layout/theme.liquid"])',
      ),
    ...paginationSchema,
  }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ theme: unknown }>(
      creds,
      GET_THEME_FILES_QUERY,
      {
        id: toGid("OnlineStoreTheme", input.themeId),
        first: input.first ?? DEFAULT_PAGE_SIZE,
        after: input.after,
        filenames: input.filenames,
      },
      "SHOPIFY_GET_THEME_FILES",
    );
    if (!data.theme) {
      throw new Error(`Theme not found: ${input.themeId}`);
    }
    return { theme: data.theme };
  },
});

export const contentTools = [
  listPages,
  listBlogs,
  listArticles,
  listMenus,
  listRedirects,
  listThemes,
  getThemeFiles,
];
