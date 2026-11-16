// Imported files live in object storage under figma-file/<id>/:
//   canvas.fig  — the document (fig-kiwi), extracted from the .fig zip by the UI
//   info.json   — name, pages, counts (written at register time)
//   parts/<n>   — upload chunks, deleted after register
import type { Env } from "../types/env.ts";
import { type Doc, pages, parseCanvas, summary } from "./fig.ts";
import { getBytes, getUrl, putBytes, urlKey } from "./storage.ts";

export const PREFIX = "figma-file/";
export const keys = (id: string) => ({
  dir: `${PREFIX}${id}/`,
  canvas: `${PREFIX}${id}/canvas.fig`,
  info: `${PREFIX}${id}/info.json`,
  part: (n: number) => `${PREFIX}${id}/parts/${String(n).padStart(5, "0")}`,
});

export const ID_RE = /^[0-9a-f]{16}$/;
export function checkId(id: string) {
  if (!ID_RE.test(id)) throw new Error(`invalid file id "${id}"`);
  return id;
}

export type Info = {
  id: string;
  name: string;
  importedAt: string;
  version: number;
  nodes: number;
  pages: { id: string; name?: string; frames: number }[];
};

export function infoOf(id: string, name: string, doc: Doc): Info {
  return {
    id,
    name,
    importedAt: new Date().toISOString(),
    version: doc.version,
    nodes: doc.byId.size,
    pages: pages(doc).map((p) => ({
      ...summary(p),
      frames: p.children.length,
    })),
  };
}

export async function readInfo(env: Env, id: string): Promise<Info> {
  return JSON.parse(
    new TextDecoder().decode(await getBytes(env, keys(id).info)),
  );
}

export const writeInfo = (env: Env, info: Info) =>
  putBytes(env, keys(info.id).info, JSON.stringify(info), "application/json");

// ponytail: in-memory LRU of parsed docs, per pod. A 60k-node file retains
// ~150 MB and peaks ~1.4 GB RSS while parsing; if pods OOM, pre-build the slim
// index at register time and store it instead of re-parsing canvas.fig.
const MAX_DOCS = 3;
const cache = new Map<string, Doc>();

/** Cache key is the unsigned presigned URL (bucket + key), so one org's
 * storage can never serve another org's parsed doc. */
export async function loadDoc(env: Env, id: string): Promise<Doc> {
  const url = await getUrl(env, keys(checkId(id)).canvas);
  const ck = urlKey(url);
  const hit = cache.get(ck);
  if (hit) {
    cache.delete(ck);
    cache.set(ck, hit);
    return hit;
  }
  return remember(ck, parseCanvas(await getBytes(env, keys(id).canvas, url)));
}

function remember(ck: string, doc: Doc) {
  cache.set(ck, doc);
  if (cache.size > MAX_DOCS) cache.delete(cache.keys().next().value as string);
  return doc;
}

/** Seeds the cache with a doc parsed at import time. */
export async function cacheDoc(env: Env, id: string, doc: Doc) {
  remember(urlKey(await getUrl(env, keys(id).canvas)), doc);
}

export async function evict(env: Env, id: string) {
  cache.delete(urlKey(await getUrl(env, keys(id).canvas)));
}
