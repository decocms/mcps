/**
 * Figma REST API client.
 *
 * Every call runs with the caller's own OAuth token, so what a tool can read is
 * exactly what that Figma user can open, and rate limits are counted against
 * that user's seat (View/Collab seats get ~20 Tier-1 calls per month; Dev/Full
 * seats get 10–20/min depending on plan).
 */

const API = "https://api.figma.com";

/** Loose shape of a Figma REST node — only the fields this MCP reads. */
// biome-ignore lint/suspicious/noExplicitAny: REST payloads are open-ended
export type FigmaNode = {
  id: string;
  name: string;
  type: string;
  [key: string]: any;
};

export interface FileRef {
  fileKey: string;
  nodeId?: string;
}

/**
 * Accepts a Figma URL (design/file/proto/board/slides/make, branch URLs
 * included) or a bare file key, plus an optional explicit node id. URL node ids
 * use `-` where the API expects `:` (`2652-13291` → `2652:13291`).
 */
export function parseFigmaRef(fileKeyOrUrl: string, nodeId?: string): FileRef {
  const raw = fileKeyOrUrl.trim();
  let fileKey = raw;
  let urlNodeId: string | undefined;

  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw);
    const parts = url.pathname.split("/").filter(Boolean);
    const kind = parts.findIndex((p) =>
      ["design", "file", "proto", "board", "slides", "make", "deck"].includes(
        p,
      ),
    );
    if (kind === -1 || !parts[kind + 1]) {
      throw new Error(`Not a Figma file URL: ${raw}`);
    }
    fileKey = parts[kind + 1];
    // Branch URLs: /design/<mainKey>/branch/<branchKey>/<name>
    const branch = parts.indexOf("branch");
    if (branch !== -1 && parts[branch + 1]) fileKey = parts[branch + 1];
    urlNodeId = url.searchParams.get("node-id") ?? undefined;
  }

  const id = nodeId ?? urlNodeId;
  return { fileKey, nodeId: id ? normalizeNodeId(id) : undefined };
}

/** Node ids never contain `-`, so every dash in a URL-style id is a colon. */
export function normalizeNodeId(id: string): string {
  return decodeURIComponent(id).trim().replaceAll("-", ":");
}

export class FigmaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function tokenFrom(runtimeContext: unknown): string {
  const env = (
    runtimeContext as {
      env?: { MESH_REQUEST_CONTEXT?: { authorization?: string | null } };
    }
  )?.env;
  const token = env?.MESH_REQUEST_CONTEXT?.authorization;
  if (!token) {
    throw new Error(
      "Missing Figma authorization. Connect this MCP with your Figma account first.",
    );
  }
  return token;
}

export async function figmaFetch<T>(
  token: string,
  path: string,
  init: {
    method?: string;
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
  } = {},
): Promise<T> {
  const url = new URL(path, API);
  for (const [k, v] of Object.entries(init.query ?? {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      // Personal access tokens (figd_…) go in X-Figma-Token; OAuth tokens are Bearer.
      ...(token.startsWith("figd_")
        ? { "X-Figma-Token": token }
        : { Authorization: `Bearer ${token}` }),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  if (res.ok) return (await res.json()) as T;

  const text = await res.text().catch(() => "");
  let detail = text;
  try {
    const json = JSON.parse(text) as { err?: string; message?: string };
    detail = json.err ?? json.message ?? text;
  } catch {
    // keep raw text
  }

  if (
    (res.status === 401 || res.status === 403) &&
    /invalid token|token expired/i.test(detail)
  ) {
    throw new FigmaApiError(
      "Figma rejected the token (expired or revoked). Reconnect the Figma connection.",
      res.status,
    );
  }
  if (res.status === 429) {
    const retry = res.headers.get("retry-after");
    const seat = res.headers.get("x-figma-rate-limit-type");
    const plan = res.headers.get("x-figma-plan-tier");
    throw new FigmaApiError(
      `Figma rate limit hit${retry ? `, retry after ${retry}s` : ""}` +
        (seat === "low"
          ? ". This account has a View/Collab seat, which Figma limits to a handful of design reads per month; connect with a Dev or Full seat."
          : "") +
        (plan ? ` (plan tier: ${plan})` : ""),
      429,
    );
  }
  if (res.status === 403) {
    throw new FigmaApiError(
      `Figma denied access (403): ${detail}. The connected account may not have access to this file, or the endpoint needs a scope/plan it lacks (variables require Enterprise).`,
      403,
    );
  }
  if (res.status === 404) {
    throw new FigmaApiError(
      `Figma file or node not found (404): ${detail}`,
      404,
    );
  }
  throw new FigmaApiError(`Figma API ${res.status}: ${detail}`, res.status);
}

export type ComponentMeta = {
  key: string;
  name: string;
  description: string;
  remote: boolean;
  componentSetId?: string;
};
export type ComponentSetMeta = {
  key: string;
  name: string;
  description: string;
  remote?: boolean;
};
export type StyleMeta = {
  key: string;
  name: string;
  styleType: string;
  remote: boolean;
  description?: string;
};

interface Assets {
  components: Record<string, ComponentMeta>;
  componentSets: Record<string, ComponentSetMeta>;
  styles: Record<string, StyleMeta>;
}

export interface NodesResponse {
  name: string;
  lastModified: string;
  editorType?: string;
  nodes: Record<string, ({ document: FigmaNode } & Assets) | null>;
}

/** Fetches one node subtree; throws a readable error when the id is unknown. */
export async function getNode(token: string, ref: FileRef, depth?: number) {
  if (!ref.nodeId)
    throw new Error(
      "A node id is required: pass a Figma link with ?node-id=… or nodeId.",
    );
  const data = await figmaFetch<NodesResponse>(
    token,
    `/v1/files/${ref.fileKey}/nodes`,
    {
      query: { ids: ref.nodeId, depth },
    },
  );
  const entry = data.nodes[ref.nodeId];
  if (!entry)
    throw new FigmaApiError(
      `Node ${ref.nodeId} not found in file ${ref.fileKey}`,
      404,
    );
  return { file: data, ...entry };
}

/** GET /v1/files/:key with a shallow depth — pages and their top-level frames. */
export function getFileShallow(token: string, fileKey: string, depth = 2) {
  return figmaFetch<
    {
      name: string;
      lastModified: string;
      editorType?: string;
      document: FigmaNode;
    } & Assets
  >(token, `/v1/files/${fileKey}`, { query: { depth } });
}

/** Figma accepts scale 0.01–4; keep renders under what vision models ingest well. */
export function fitScale(
  width: number,
  height: number,
  requested?: number,
): number {
  const max = Math.min(
    requested ?? 2,
    1600 / Math.max(width, 1),
    7900 / Math.max(height, 1),
    4,
  );
  return Math.max(0.01, Math.round(max * 100) / 100);
}

export async function renderImages(
  token: string,
  fileKey: string,
  ids: string[],
  opts: {
    format?: "png" | "jpg" | "svg" | "pdf";
    scale?: number;
    useAbsoluteBounds?: boolean;
  } = {},
): Promise<Record<string, string | null>> {
  const data = await figmaFetch<{
    err: string | null;
    images: Record<string, string | null>;
  }>(token, `/v1/images/${fileKey}`, {
    query: {
      ids: ids.join(","),
      format: opts.format ?? "png",
      scale:
        opts.format === "svg" || opts.format === "pdf" ? undefined : opts.scale,
      use_absolute_bounds: opts.useAbsoluteBounds,
      svg_outline_text: opts.format === "svg" ? false : undefined,
    },
  });
  if (data.err)
    throw new FigmaApiError(`Figma render failed: ${data.err}`, 400);
  return data.images;
}

export async function downloadBase64(
  url: string,
): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok)
    throw new Error(`Downloading rendered image failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    data: buf.toString("base64"),
    mimeType: res.headers.get("content-type") ?? "image/png",
  };
}

/** Depth-first walk; return `false` from the visitor to skip a subtree. */
export function walk(
  node: FigmaNode,
  visit: (n: FigmaNode, depth: number) => boolean | void,
  depth = 0,
) {
  if (visit(node, depth) === false) return;
  for (const child of node.children ?? []) walk(child, visit, depth + 1);
}

export function subtreeIds(node: FigmaNode): Set<string> {
  const ids = new Set<string>();
  walk(node, (n) => {
    ids.add(n.id);
  });
  return ids;
}

/** Runs `fn` over `items` with at most `limit` in flight (Figma rate limits are per minute). */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = Array.from({ length: items.length });
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return out;
}
