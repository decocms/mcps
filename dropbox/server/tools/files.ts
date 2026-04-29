/**
 * File / folder tools — list, search, metadata, download, upload, mutations.
 */

import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import {
  dropboxContentFetch,
  dropboxFetch,
  envFromCtx,
} from "../lib/dropbox-client.ts";

/** Dropbox returns >10MB inline payloads as a temporary link instead. */
const INLINE_DOWNLOAD_LIMIT_BYTES = 10 * 1024 * 1024;
/** Dropbox single-shot upload cap (sessions are not implemented in v1). */
const UPLOAD_LIMIT_BYTES = 150 * 1024 * 1024;

const PathArg = z
  .string()
  .describe(
    "Dropbox path — must start with `/` (e.g. `/Documents/report.pdf`). Use empty string for the root folder on list_folder.",
  );

export const listFolderTool = createTool({
  id: "dropbox_list_folder",
  description:
    "List the contents of a folder. Pass `cursor` to continue paginating from a previous response — the tool will route to /files/list_folder/continue automatically.",
  inputSchema: z.object({
    path: z
      .string()
      .optional()
      .describe(
        "Folder path (empty string for root). Ignored when `cursor` is provided.",
      ),
    cursor: z
      .string()
      .optional()
      .describe(
        "Pagination cursor from a previous list_folder response. When set, all other inputs are ignored.",
      ),
    recursive: z.boolean().optional().describe("Recurse into subfolders."),
    include_deleted: z
      .boolean()
      .optional()
      .describe("Include deleted entries in the results."),
    include_media_info: z
      .boolean()
      .optional()
      .describe("Include image/video metadata when available."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(2000)
      .optional()
      .describe("Maximum number of entries per page (1-2000)."),
  }),
  execute: async ({ context }, ctx) => {
    const env = envFromCtx(ctx);
    if (context.cursor) {
      return dropboxFetch(env, "files/list_folder/continue", {
        body: { cursor: context.cursor },
      });
    }
    return dropboxFetch(env, "files/list_folder", {
      body: {
        path: context.path ?? "",
        recursive: context.recursive,
        include_deleted: context.include_deleted,
        include_media_info: context.include_media_info,
        limit: context.limit,
      },
    });
  },
});

export const searchTool = createTool({
  id: "dropbox_search",
  description:
    "Search for files and folders by query string. Uses /files/search_v2.",
  inputSchema: z.object({
    query: z.string().describe("Search query (filename and/or content)."),
    path: z
      .string()
      .optional()
      .describe("Restrict search to this folder (default: account root)."),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe("Maximum results (1-1000, default 100)."),
    file_status: z
      .enum(["active", "deleted"])
      .optional()
      .describe("Restrict to active or deleted files."),
    filename_only: z
      .boolean()
      .optional()
      .describe("Match only on filename (skip content)."),
  }),
  execute: async ({ context }, ctx) => {
    const env = envFromCtx(ctx);
    const options: Record<string, unknown> = {};
    if (context.path) options.path = context.path;
    if (context.max_results) options.max_results = context.max_results;
    if (context.file_status) options.file_status = context.file_status;
    if (context.filename_only !== undefined) {
      options.filename_only = context.filename_only;
    }
    return dropboxFetch(env, "files/search_v2", {
      body: {
        query: context.query,
        ...(Object.keys(options).length > 0 ? { options } : {}),
      },
    });
  },
});

export const getMetadataTool = createTool({
  id: "dropbox_get_metadata",
  description:
    "Get metadata for a file, folder, or deleted item at the given path.",
  inputSchema: z.object({
    path: PathArg,
    include_deleted: z.boolean().optional(),
    include_media_info: z.boolean().optional(),
    include_has_explicit_shared_members: z.boolean().optional(),
  }),
  execute: async ({ context }, ctx) =>
    dropboxFetch(envFromCtx(ctx), "files/get_metadata", {
      body: {
        path: context.path,
        include_deleted: context.include_deleted,
        include_media_info: context.include_media_info,
        include_has_explicit_shared_members:
          context.include_has_explicit_shared_members,
      },
    }),
});

export const downloadFileTool = createTool({
  id: "dropbox_download_file",
  description:
    "Download a file. Returns base64-encoded contents inline for files <=10MB; for larger files returns a temporary direct link instead. Use `dropbox_get_temporary_link` directly when you don't need the bytes.",
  inputSchema: z.object({
    path: PathArg,
  }),
  execute: async ({ context }, ctx) => {
    const env = envFromCtx(ctx);

    // Cheap metadata check first so we can route oversize files to a link
    // without ever streaming them through the worker (Workers have hard
    // memory caps; ~128MB on the standard plan).
    const metadata = (await dropboxFetch(env, "files/get_metadata", {
      body: { path: context.path },
    })) as { ".tag"?: string; size?: number; name?: string; path_lower?: string };

    if (metadata[".tag"] !== "file") {
      throw new Error(
        `Path ${context.path} is not a file (tag=${metadata[".tag"]})`,
      );
    }

    if ((metadata.size ?? 0) > INLINE_DOWNLOAD_LIMIT_BYTES) {
      const link = (await dropboxFetch(env, "files/get_temporary_link", {
        body: { path: context.path },
      })) as { link: string; metadata: unknown };
      return {
        oversize: true,
        size: metadata.size,
        name: metadata.name,
        path_lower: metadata.path_lower,
        link: link.link,
        metadata: link.metadata,
        message: `File is larger than ${INLINE_DOWNLOAD_LIMIT_BYTES} bytes — returning a temporary direct download link instead of inline contents.`,
      };
    }

    const { headers, response } = await dropboxContentFetch(
      env,
      "files/download",
      { arg: { path: context.path } },
    );

    const fileMetadata = headers.get("dropbox-api-result");
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Encode as base64 for transport. btoa requires latin-1 string input;
    // chunk to avoid call-stack issues on larger payloads.
    let binary = "";
    const chunkSize = 32_768;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    const content_base64 = btoa(binary);

    return {
      oversize: false,
      size: bytes.length,
      content_base64,
      metadata: fileMetadata ? JSON.parse(fileMetadata) : null,
    };
  },
});

export const getTemporaryLinkTool = createTool({
  id: "dropbox_get_temporary_link",
  description:
    "Get a short-lived (~4 hour) direct download URL for a file. Useful for streaming or sharing with downstream tooling.",
  inputSchema: z.object({
    path: PathArg,
  }),
  execute: async ({ context }, ctx) =>
    dropboxFetch(envFromCtx(ctx), "files/get_temporary_link", {
      body: { path: context.path },
    }),
});

export const uploadFileTool = createTool({
  id: "dropbox_upload_file",
  description:
    "Upload a file (≤150 MB). Provide either `content_base64` for binary data or `content_text` for plain text — exactly one is required. Use this only for small/medium files; chunked sessions are not implemented in v1.",
  inputSchema: z.object({
    path: PathArg,
    content_base64: z
      .string()
      .optional()
      .describe("Base64-encoded file contents. Mutually exclusive with content_text."),
    content_text: z
      .string()
      .optional()
      .describe("UTF-8 plain text contents. Mutually exclusive with content_base64."),
    mode: z
      .enum(["add", "overwrite", "update"])
      .optional()
      .default("add")
      .describe(
        "Write mode: `add` (rename if exists), `overwrite`, or `update` (only if rev matches).",
      ),
    autorename: z
      .boolean()
      .optional()
      .describe(
        "On conflict in `add` mode, append a number to the filename instead of failing.",
      ),
    mute: z
      .boolean()
      .optional()
      .describe("Don't notify the user about the upload."),
    strict_conflict: z.boolean().optional(),
  }),
  execute: async ({ context }, ctx) => {
    const env = envFromCtx(ctx);
    if (!context.content_base64 && !context.content_text) {
      throw new Error("Provide either content_base64 or content_text.");
    }
    if (context.content_base64 && context.content_text) {
      throw new Error("Provide only one of content_base64 or content_text.");
    }

    let body: Uint8Array;
    if (context.content_base64) {
      const binary = atob(context.content_base64);
      body = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        body[i] = binary.charCodeAt(i);
      }
    } else {
      body = new TextEncoder().encode(context.content_text!);
    }

    if (body.byteLength > UPLOAD_LIMIT_BYTES) {
      throw new Error(
        `Upload exceeds the ${UPLOAD_LIMIT_BYTES}-byte single-request limit. Use Dropbox upload sessions for larger files (not implemented in v1).`,
      );
    }

    const arg: Record<string, unknown> = {
      path: context.path,
      mode: context.mode ?? "add",
    };
    if (context.autorename !== undefined) arg.autorename = context.autorename;
    if (context.mute !== undefined) arg.mute = context.mute;
    if (context.strict_conflict !== undefined) {
      arg.strict_conflict = context.strict_conflict;
    }

    const { response } = await dropboxContentFetch(env, "files/upload", {
      arg,
      body,
    });
    return await response.json();
  },
});

export const createFolderTool = createTool({
  id: "dropbox_create_folder",
  description: "Create a new folder at the given path.",
  inputSchema: z.object({
    path: PathArg,
    autorename: z
      .boolean()
      .optional()
      .describe("On conflict, append a number to the folder name."),
  }),
  execute: async ({ context }, ctx) =>
    dropboxFetch(envFromCtx(ctx), "files/create_folder_v2", {
      body: { path: context.path, autorename: context.autorename },
    }),
});

export const moveTool = createTool({
  id: "dropbox_move",
  description: "Move (rename) a file or folder.",
  inputSchema: z.object({
    from_path: PathArg,
    to_path: PathArg,
    allow_shared_folder: z.boolean().optional(),
    autorename: z.boolean().optional(),
    allow_ownership_transfer: z.boolean().optional(),
  }),
  execute: async ({ context }, ctx) =>
    dropboxFetch(envFromCtx(ctx), "files/move_v2", {
      body: {
        from_path: context.from_path,
        to_path: context.to_path,
        allow_shared_folder: context.allow_shared_folder,
        autorename: context.autorename,
        allow_ownership_transfer: context.allow_ownership_transfer,
      },
    }),
});

export const copyTool = createTool({
  id: "dropbox_copy",
  description: "Copy a file or folder to a new location.",
  inputSchema: z.object({
    from_path: PathArg,
    to_path: PathArg,
    allow_shared_folder: z.boolean().optional(),
    autorename: z.boolean().optional(),
    allow_ownership_transfer: z.boolean().optional(),
  }),
  execute: async ({ context }, ctx) =>
    dropboxFetch(envFromCtx(ctx), "files/copy_v2", {
      body: {
        from_path: context.from_path,
        to_path: context.to_path,
        allow_shared_folder: context.allow_shared_folder,
        autorename: context.autorename,
        allow_ownership_transfer: context.allow_ownership_transfer,
      },
    }),
});

export const deleteTool = createTool({
  id: "dropbox_delete",
  description: "Delete a file or folder. Deleted items can be restored.",
  inputSchema: z.object({
    path: PathArg,
  }),
  execute: async ({ context }, ctx) =>
    dropboxFetch(envFromCtx(ctx), "files/delete_v2", {
      body: { path: context.path },
    }),
});

export const restoreTool = createTool({
  id: "dropbox_restore",
  description:
    "Restore a previous revision of a file. Use `dropbox_list_revisions` to find revision IDs.",
  inputSchema: z.object({
    path: PathArg,
    rev: z.string().describe("Revision id to restore."),
  }),
  execute: async ({ context }, ctx) =>
    dropboxFetch(envFromCtx(ctx), "files/restore", {
      body: { path: context.path, rev: context.rev },
    }),
});

export const listRevisionsTool = createTool({
  id: "dropbox_list_revisions",
  description: "List previous revisions of a file.",
  inputSchema: z.object({
    path: PathArg,
    mode: z
      .enum(["path", "id"])
      .optional()
      .describe(
        "How to interpret `path` — `path` (default) or `id` (Dropbox file id).",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Max revisions to return (1-100, default 10)."),
  }),
  execute: async ({ context }, ctx) =>
    dropboxFetch(envFromCtx(ctx), "files/list_revisions", {
      body: {
        path: context.path,
        mode: context.mode,
        limit: context.limit,
      },
    }),
});
