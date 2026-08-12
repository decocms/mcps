/**
 * Online store theme *write* tools: create/update and delete theme files
 * (Liquid templates, JSON settings, section/asset files).
 *
 * These are the only mutations in this MCP. Every other tool is a read-only
 * query — see tools/index.ts. Writing theme files requires the `write_themes`
 * scope; a token with only `read_themes` fails with an ACCESS_DENIED hint.
 */
import { z } from "zod";
import { shopifyGraphql, toGid } from "../lib/client.ts";
import { createShopifyTool } from "../lib/tool.ts";

/** Shape of Shopify's `userErrors` on the theme-file mutations. */
interface ThemeFilesUserError {
  filename?: string | null;
  code?: string | null;
  message: string;
}

/**
 * Theme-file mutations report business errors in `userErrors` (not the
 * top-level GraphQL `errors` that shopifyGraphql already throws on), so they'd
 * otherwise pass silently. Throw a descriptive error when any are present.
 */
function assertNoUserErrors(
  errors: ThemeFilesUserError[] | undefined,
  toolId: string,
): void {
  if (!errors?.length) return;
  const detail = errors
    .map((e) => {
      const where = e.filename ? `${e.filename}: ` : "";
      const code = e.code ? ` (${e.code})` : "";
      return `${where}${e.message}${code}`;
    })
    .join("; ");
  throw new Error(
    `Shopify rejected the theme file change [tool=${toolId}]: ${detail}`,
  );
}

export const UPDATE_THEME_FILES_MUTATION = `
mutation UpdateThemeFiles($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
  themeFilesUpsert(themeId: $themeId, files: $files) {
    upsertedThemeFiles {
      filename
    }
    userErrors {
      filename
      code
      message
    }
  }
}`;

export const updateThemeFiles = createShopifyTool({
  id: "SHOPIFY_UPDATE_THEME_FILES",
  description:
    "Create or overwrite theme files (Liquid, JSON settings, assets) on a theme. " +
    "Each file is fully replaced by the content you provide — there is no partial patch, " +
    "so read the current file first (SHOPIFY_GET_THEME_FILES) and send the complete new body. " +
    "Editing the live (MAIN) theme changes the storefront immediately; prefer an UNPUBLISHED " +
    "theme when testing. Requires the write_themes scope.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
  },
  inputSchema: z.object({
    themeId: z
      .string()
      .describe(
        'Theme ID — numeric or GID ("gid://shopify/OnlineStoreTheme/123"). Use SHOPIFY_LIST_THEMES to find it.',
      ),
    files: z
      .array(
        z.object({
          filename: z
            .string()
            .describe(
              'Theme-relative path, e.g. "sections/header.liquid" or "templates/product.json".',
            ),
          content: z
            .string()
            .describe(
              "Full new content of the file (text). For binary assets, set encoding to BASE64.",
            ),
          encoding: z
            .enum(["TEXT", "BASE64"])
            .optional()
            .describe("How content is encoded (default TEXT)."),
        }),
      )
      .min(1)
      .describe("Files to create or overwrite (each fully replaced)."),
  }),
  handler: async (input, creds) => {
    const files = input.files.map((f) => ({
      filename: f.filename,
      body: { type: f.encoding ?? "TEXT", value: f.content },
    }));
    const data = await shopifyGraphql<{
      themeFilesUpsert: {
        upsertedThemeFiles: { filename: string }[] | null;
        userErrors: ThemeFilesUserError[];
      } | null;
    }>(
      creds,
      UPDATE_THEME_FILES_MUTATION,
      { themeId: toGid("OnlineStoreTheme", input.themeId), files },
      "SHOPIFY_UPDATE_THEME_FILES",
    );
    assertNoUserErrors(
      data.themeFilesUpsert?.userErrors,
      "SHOPIFY_UPDATE_THEME_FILES",
    );
    return {
      upsertedFiles: data.themeFilesUpsert?.upsertedThemeFiles ?? [],
    };
  },
});

export const DELETE_THEME_FILES_MUTATION = `
mutation DeleteThemeFiles($themeId: ID!, $files: [String!]!) {
  themeFilesDelete(themeId: $themeId, files: $files) {
    deletedThemeFiles {
      filename
    }
    userErrors {
      filename
      code
      message
    }
  }
}`;

export const deleteThemeFiles = createShopifyTool({
  id: "SHOPIFY_DELETE_THEME_FILES",
  description:
    "Delete files from a theme by exact filename. Deleting a file the theme " +
    "depends on can break the storefront — prefer an UNPUBLISHED theme when " +
    "unsure. Requires the write_themes scope.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
  },
  inputSchema: z.object({
    themeId: z
      .string()
      .describe(
        'Theme ID — numeric or GID ("gid://shopify/OnlineStoreTheme/123").',
      ),
    filenames: z
      .array(z.string())
      .min(1)
      .describe(
        'Exact theme-relative paths to delete, e.g. ["sections/custom.liquid"].',
      ),
  }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{
      themeFilesDelete: {
        deletedThemeFiles: { filename: string }[] | null;
        userErrors: ThemeFilesUserError[];
      } | null;
    }>(
      creds,
      DELETE_THEME_FILES_MUTATION,
      {
        themeId: toGid("OnlineStoreTheme", input.themeId),
        files: input.filenames,
      },
      "SHOPIFY_DELETE_THEME_FILES",
    );
    assertNoUserErrors(
      data.themeFilesDelete?.userErrors,
      "SHOPIFY_DELETE_THEME_FILES",
    );
    return {
      deletedFiles: data.themeFilesDelete?.deletedThemeFiles ?? [],
    };
  },
});

export const themeWriteTools = [updateThemeFiles, deleteThemeFiles];
