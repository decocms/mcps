/**
 * Object storage (the org's storage in Studio) through presigned URLs.
 *
 * Layout under STORAGE_PREFIX:
 *   assets/plate.png                         the backdrop plate, 1600×2000, blurred
 *   pieces/<productId>/source.json + .jpg    the original generation of the garment
 *   pieces/<productId>/versions/<id>.json    one edit: prompt, model, check
 *   pieces/<productId>/versions/<id>.jpg     the composed Still
 *   pieces/<productId>/versions/<id>-model   what the model returned (PNG or JPEG)
 *   pieces/<productId>/publications/<id>.json + -before.jpg
 *   jobs/<id>.json                           edit job state
 *   locks/<productId>.json                   one publication at a time
 */
import { callConnectionTool } from "./connection.ts";
import { type Env, settings } from "../types/env.ts";

const URL_TTL_SECONDS = 3600;

export function storage(env: Env) {
  const prefix = settings(env).STORAGE_PREFIX.replace(/\/+$/, "");
  const key = (path: string) => `${prefix}/${path}`;

  async function getUrl(path: string): Promise<string> {
    const { url } = (await callConnectionTool(
      env,
      "OBJECT_STORAGE",
      "GET_PRESIGNED_URL",
      { key: key(path), expiresIn: URL_TTL_SECONDS },
    )) as { url: string };
    return url;
  }

  /** Without a content type, the URL accepts any (the uploader picks it). */
  async function putUrl(path: string, contentType?: string): Promise<string> {
    const { url } = (await callConnectionTool(
      env,
      "OBJECT_STORAGE",
      "PUT_PRESIGNED_URL",
      { key: key(path), expiresIn: URL_TTL_SECONDS, contentType },
    )) as { url: string };
    return url;
  }

  async function put(
    path: string,
    body: Uint8Array | string,
    contentType: string,
  ): Promise<void> {
    const res = await fetch(await putUrl(path, contentType), {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: typeof body === "string" ? body : new Uint8Array(body),
    });
    if (!res.ok) throw new Error(`Storage write ${path}: HTTP ${res.status}`);
  }

  /** The object's bytes, or null when it does not exist. */
  async function get(path: string): Promise<Uint8Array | null> {
    const res = await fetch(await getUrl(path));
    if (res.status === 404 || res.status === 403) return null;
    if (!res.ok) throw new Error(`Storage read ${path}: HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async function getJson<T>(path: string): Promise<T | null> {
    const bytes = await get(path);
    return bytes ? (JSON.parse(new TextDecoder().decode(bytes)) as T) : null;
  }

  const putJson = (path: string, value: unknown) =>
    put(path, JSON.stringify(value), "application/json");

  /** Paths (relative to the prefix) under `folder`. */
  async function list(folder: string): Promise<string[]> {
    const paths: string[] = [];
    let continuationToken: string | undefined;
    do {
      const page = (await callConnectionTool(
        env,
        "OBJECT_STORAGE",
        "LIST_OBJECTS",
        { prefix: key(folder), continuationToken },
      )) as {
        objects: { key: string }[];
        nextContinuationToken?: string;
      };
      for (const object of page.objects) {
        paths.push(object.key.slice(prefix.length + 1));
      }
      continuationToken = page.nextContinuationToken;
    } while (continuationToken);
    return paths;
  }

  async function remove(path: string): Promise<void> {
    await callConnectionTool(env, "OBJECT_STORAGE", "DELETE_OBJECT", {
      key: key(path),
    });
  }

  return { getUrl, putUrl, put, get, getJson, putJson, list, remove };
}

export type Storage = ReturnType<typeof storage>;
