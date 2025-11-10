/**
 * Object storage tools for S3-compatible storage operations.
 *
 * This file contains all tools related to object storage including:
 * - Listing objects with pagination
 * - Getting object metadata (HEAD)
 * - Generating presigned URLs for GET and PUT operations
 * - Deleting objects (single and batch)
 */
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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
      const state = env.DECO_CHAT_REQUEST_CONTEXT.state;

      const command = new ListObjectsV2Command({
        Bucket: state.bucketName,
        Prefix: prefix,
        MaxKeys: maxKeys,
        ContinuationToken: continuationToken,
      });

      const response = await s3Client.send(command);

      return {
        objects: (response.Contents || []).map((obj) => ({
          key: obj.Key!,
          size: obj.Size!,
          lastModified: obj.LastModified!.toISOString(),
          etag: obj.ETag!,
        })),
        nextContinuationToken: response.NextContinuationToken,
        isTruncated: response.IsTruncated ?? false,
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
      const state = env.DECO_CHAT_REQUEST_CONTEXT.state;

      const command = new HeadObjectCommand({
        Bucket: state.bucketName,
        Key: key,
      });

      const response = await s3Client.send(command);

      return {
        contentType: response.ContentType,
        contentLength: response.ContentLength!,
        lastModified: response.LastModified!.toISOString(),
        etag: response.ETag!,
        metadata: response.Metadata,
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
      const state = env.DECO_CHAT_REQUEST_CONTEXT.state;
      const expirationSeconds = getPresignedUrlExpiration(env, expiresIn);

      const command = new GetObjectCommand({
        Bucket: state.bucketName,
        Key: key,
      });

      const url = await getSignedUrl(s3Client, command, {
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
      const state = env.DECO_CHAT_REQUEST_CONTEXT.state;
      const expirationSeconds = getPresignedUrlExpiration(env, expiresIn);

      const command = new PutObjectCommand({
        Bucket: state.bucketName,
        Key: key,
        ContentType: contentType,
      });

      const url = await getSignedUrl(s3Client, command, {
        expiresIn: expirationSeconds,
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
      const state = env.DECO_CHAT_REQUEST_CONTEXT.state;

      const command = new DeleteObjectCommand({
        Bucket: state.bucketName,
        Key: key,
      });

      await s3Client.send(command);

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
      const state = env.DECO_CHAT_REQUEST_CONTEXT.state;

      const command = new DeleteObjectsCommand({
        Bucket: state.bucketName,
        Delete: {
          Objects: keys.map((key: string) => ({ Key: key })),
        },
      });

      const response = await s3Client.send(command);

      return {
        deleted: (response.Deleted || []).map((obj) => obj.Key!),
        errors: (response.Errors || []).map((err) => ({
          key: err.Key!,
          message: err.Message || "Unknown error",
        })),
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
