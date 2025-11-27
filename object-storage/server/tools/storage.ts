/**
 * Object storage tools for S3-compatible storage operations.
 *
 * This file contains all tools related to object storage including:
 * - Listing objects with pagination
 * - Getting object metadata (HEAD)
 * - Generating presigned URLs for GET and PUT operations
 * - Deleting objects (single and batch)
 */
import { createPrivateTool } from "@decocms/runtime/mastra";
import { z } from "zod";
import type { Env } from "../main.ts";
import { createS3Client, getPresignedUrlExpiration } from "../lib/s3-client.ts";

/**
 * LIST_OBJECTS - List objects in the bucket with pagination support
 */
export const createListObjectsTool = (env: Env) =>
  createPrivateTool({
    id: "LIST_OBJECTS",
    description:
      "List objects in the S3 bucket. Supports prefix filtering and pagination for large buckets.",
    inputSchema: z.object({
      prefix: z
        .string()
        .optional()
        .describe(
          "Filter objects by prefix (e.g., 'folder/' for folder contents)",
        ),
      maxKeys: z
        .number()
        .optional()
        .default(1000)
        .describe("Maximum number of keys to return (default: 1000)"),
      continuationToken: z
        .string()
        .optional()
        .describe("Token for pagination from previous response"),
    }),
    outputSchema: z.object({
      objects: z.array(
        z.object({
          key: z.string().describe("Object key/path"),
          size: z.number().describe("Object size in bytes"),
          lastModified: z.string().describe("Last modified timestamp"),
          etag: z.string().describe("Entity tag for the object"),
        }),
      ),
      nextContinuationToken: z
        .string()
        .optional()
        .describe("Token for fetching next page of results"),
      isTruncated: z
        .boolean()
        .describe("Whether there are more results available"),
    }),
    execute: async (ctx: any) => {
      const { prefix, maxKeys, continuationToken } = ctx;
      const s3Client = createS3Client(env);

      const response = await s3Client.list({
        prefix,
        maxKeys,
        startAfter: continuationToken,
      });

      return {
        objects: (response.contents || []).map((obj) => ({
          key: obj.key,
          size: obj.size ?? 0,
          lastModified: obj.lastModified
            ? typeof obj.lastModified === "object"
              ? (obj.lastModified as Date).toISOString()
              : String(obj.lastModified)
            : "",
          etag: obj.eTag ?? "",
        })),
        nextContinuationToken: response.isTruncated
          ? response.contents?.at(-1)?.key
          : undefined,
        isTruncated: response.isTruncated ?? false,
      };
    },
  });

/**
 * GET_OBJECT_METADATA - Get object metadata using HEAD operation
 */
export const createGetObjectMetadataTool = (env: Env) =>
  createPrivateTool({
    id: "GET_OBJECT_METADATA",
    description:
      "Get metadata for an object without downloading it (HEAD operation)",
    inputSchema: z.object({
      key: z.string().describe("Object key/path to get metadata for"),
    }),
    outputSchema: z.object({
      contentType: z.string().optional().describe("MIME type of the object"),
      contentLength: z.number().describe("Size of the object in bytes"),
      lastModified: z.string().describe("Last modified timestamp"),
      etag: z.string().describe("Entity tag for the object"),
      metadata: z
        .record(z.string())
        .optional()
        .describe("Custom metadata key-value pairs"),
    }),
    execute: async (ctx: any) => {
      const { key } = ctx;
      const s3Client = createS3Client(env);

      const stat = await s3Client.file(key).stat();

      return {
        contentType: stat.type,
        contentLength: stat.size,
        lastModified: stat.lastModified.toISOString(),
        etag: stat.etag,
        metadata: undefined, // Bun's stat doesn't include custom metadata
      };
    },
  });

/**
 * GET_PRESIGNED_URL - Generate a presigned URL for downloading an object
 */
export const createGetPresignedUrlTool = (env: Env) =>
  createPrivateTool({
    id: "GET_PRESIGNED_URL",
    description:
      "Generate a presigned URL for downloading an object. The URL allows temporary access without credentials.",
    inputSchema: z.object({
      key: z.string().describe("Object key/path to generate URL for"),
      expiresIn: z
        .number()
        .optional()
        .describe(
          "URL expiration time in seconds (default: from state config or 3600)",
        ),
    }),
    outputSchema: z.object({
      url: z.string().describe("Presigned URL for downloading the object"),
      expiresIn: z
        .number()
        .describe("Expiration time in seconds that was used"),
    }),
    execute: async (ctx: any) => {
      const { key, expiresIn } = ctx;
      const s3Client = createS3Client(env);
      const expirationSeconds = getPresignedUrlExpiration(env, expiresIn);

      const url = s3Client.file(key).presign({
        method: "GET",
        expiresIn: expirationSeconds,
      });

      return {
        url,
        expiresIn: expirationSeconds,
      };
    },
  });

/**
 * PUT_PRESIGNED_URL - Generate a presigned URL for uploading an object
 */
export const createPutPresignedUrlTool = (env: Env) =>
  createPrivateTool({
    id: "PUT_PRESIGNED_URL",
    description:
      "Generate a presigned URL for uploading an object. The URL allows temporary upload access without credentials.",
    inputSchema: z.object({
      key: z.string().describe("Object key/path for the upload"),
      expiresIn: z
        .number()
        .optional()
        .describe(
          "URL expiration time in seconds (default: from state config or 3600)",
        ),
      contentType: z
        .string()
        .optional()
        .describe("MIME type for the object being uploaded"),
    }),
    outputSchema: z.object({
      url: z.string().describe("Presigned URL for uploading the object"),
      expiresIn: z
        .number()
        .describe("Expiration time in seconds that was used"),
    }),
    execute: async (ctx: any) => {
      const { key, expiresIn, contentType } = ctx;
      const s3Client = createS3Client(env);
      const expirationSeconds = getPresignedUrlExpiration(env, expiresIn);

      const url = s3Client.file(key).presign({
        method: "PUT",
        expiresIn: expirationSeconds,
        type: contentType,
      });

      return {
        url,
        expiresIn: expirationSeconds,
      };
    },
  });

/**
 * DELETE_OBJECT - Delete a single object
 */
export const createDeleteObjectTool = (env: Env) =>
  createPrivateTool({
    id: "DELETE_OBJECT",
    description: "Delete a single object from the bucket",
    inputSchema: z.object({
      key: z.string().describe("Object key/path to delete"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the deletion was successful"),
      key: z.string().describe("The key that was deleted"),
    }),
    execute: async (ctx: any) => {
      const { key } = ctx;
      const s3Client = createS3Client(env);

      await s3Client.file(key).delete();

      return {
        success: true,
        key,
      };
    },
  });

/**
 * DELETE_OBJECTS - Delete multiple objects in batch
 */
export const createDeleteObjectsTool = (env: Env) =>
  createPrivateTool({
    id: "DELETE_OBJECTS",
    description:
      "Delete multiple objects in a single batch operation (max 1000 objects)",
    inputSchema: z.object({
      keys: z
        .array(z.string())
        .max(1000)
        .describe("Array of object keys/paths to delete (max 1000)"),
    }),
    outputSchema: z.object({
      deleted: z
        .array(z.string())
        .describe("Array of successfully deleted keys"),
      errors: z
        .array(
          z.object({
            key: z.string(),
            message: z.string(),
          }),
        )
        .describe("Array of errors for failed deletions"),
    }),
    execute: async (ctx: any) => {
      const { keys } = ctx;
      const s3Client = createS3Client(env);

      // Bun doesn't have batch delete, so we use Promise.allSettled for parallel deletes
      const results = await Promise.allSettled(
        keys.map((key: string) => s3Client.file(key).delete()),
      );

      const deleted: string[] = [];
      const errors: Array<{ key: string; message: string }> = [];

      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          deleted.push(keys[index]);
        } else {
          errors.push({
            key: keys[index],
            message: result.reason?.message || "Unknown error",
          });
        }
      });

      return {
        deleted,
        errors,
      };
    },
  });

// Export all storage-related tools
export const storageTools = [
  createListObjectsTool,
  createGetObjectMetadataTool,
  createGetPresignedUrlTool,
  createPutPresignedUrlTool,
  createDeleteObjectTool,
  createDeleteObjectsTool,
];
