/**
 * OBJECT_STORAGE binding helpers.
 *
 * At runtime, BindingOf bindings in the state are resolved into MCP client
 * stubs (same pattern as veo/tanstack-migrator).
 */
import type { Env } from "../types/env.ts";

export interface ObjectStorageBinding {
  GET_PRESIGNED_URL: (input: {
    key: string;
    expiresIn?: number;
  }) => Promise<{ url: string; expiresIn: number }>;
  PUT_PRESIGNED_URL: (input: {
    key: string;
    expiresIn?: number;
    contentType?: string;
  }) => Promise<{ url: string; expiresIn: number }>;
}

export function getObjectStorage(env: Env): ObjectStorageBinding {
  const storage = env.MESH_REQUEST_CONTEXT?.state?.OBJECT_STORAGE;
  if (!storage) {
    throw new Error(
      "OBJECT_STORAGE binding is not configured. Connect an object-storage MCP (@deco/object-storage) to enable downloads.",
    );
  }
  return storage as unknown as ObjectStorageBinding;
}

/**
 * Uploads a local file to object storage via presigned PUT.
 * S3 presigned PUTs require a Content-Length, which is why callers spool
 * to disk first — Bun.file() streams from disk with the length set.
 */
export async function putFile(
  storage: ObjectStorageBinding,
  options: { tmpPath: string; key: string; contentType: string },
): Promise<void> {
  const { url } = await storage.PUT_PRESIGNED_URL({
    key: options.key,
    contentType: options.contentType,
    expiresIn: 3600,
  });
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": options.contentType },
    body: Bun.file(options.tmpPath),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to upload to object storage: ${response.status} ${await response.text()}`,
    );
  }
}
