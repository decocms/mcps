// OBJECT_STORAGE binding (@deco/object-storage) helpers. Same shape as
// youtube-search/server/lib/storage.ts, plus list/delete.
import type { Env } from "../types/env.ts";

interface ObjectStorage {
  GET_PRESIGNED_URL(i: {
    key: string;
    expiresIn?: number;
  }): Promise<{ url: string }>;
  PUT_PRESIGNED_URL(i: {
    key: string;
    expiresIn?: number;
    contentType?: string;
  }): Promise<{ url: string }>;
  LIST_OBJECTS(i: { prefix?: string; continuationToken?: string }): Promise<{
    objects: { key: string; size: number; lastModified: string }[];
    nextContinuationToken?: string;
    isTruncated: boolean;
  }>;
  DELETE_OBJECTS(i: { keys: string[] }): Promise<{ deleted: string[] }>;
}

export function storage(env: Env): ObjectStorage {
  const s = env.MESH_REQUEST_CONTEXT?.state?.OBJECT_STORAGE;
  if (!s)
    throw new Error(
      "OBJECT_STORAGE binding is not configured. Connect an object-storage MCP (@deco/object-storage) to this app.",
    );
  return s as unknown as ObjectStorage;
}

/** Presigned GET URL without its signature: stable per bucket+key, used as cache key. */
export const urlKey = (url: string) => url.split("?")[0];

export async function getUrl(env: Env, key: string) {
  return (await storage(env).GET_PRESIGNED_URL({ key, expiresIn: 600 })).url;
}

export async function getBytes(env: Env, key: string, url?: string) {
  const res = await fetch(url ?? (await getUrl(env, key)));
  if (res.status === 404 || res.status === 403)
    throw new Error(`object not found: ${key}`);
  if (!res.ok) throw new Error(`storage GET ${key} failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function putBytes(
  env: Env,
  key: string,
  body: Uint8Array | string,
  contentType = "application/octet-stream",
) {
  const { url } = await storage(env).PUT_PRESIGNED_URL({
    key,
    contentType,
    expiresIn: 600,
  });
  // S3 presigned PUT needs Content-Length; a Uint8Array/string body sets it.
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: body as BodyInit,
  });
  if (!res.ok)
    throw new Error(
      `storage PUT ${key} failed: ${res.status} ${await res.text()}`,
    );
}

export async function listKeys(env: Env, prefix: string) {
  const out: { key: string; size: number; lastModified: string }[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await storage(env).LIST_OBJECTS({ prefix, continuationToken });
    out.push(...page.objects);
    continuationToken = page.isTruncated
      ? page.nextContinuationToken
      : undefined;
  } while (continuationToken);
  return out;
}

export async function deleteKeys(env: Env, keys: string[]) {
  for (let i = 0; i < keys.length; i += 1000)
    await storage(env).DELETE_OBJECTS({ keys: keys.slice(i, i + 1000) });
}
