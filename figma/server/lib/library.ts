/**
 * Published-library lookups (components, component sets, styles) and dev
 * resources, which back the design-system and Code Connect tools.
 */

import { figmaFetch, mapLimit } from "./figma.ts";

export interface PublishedAsset {
  key: string;
  file_key: string;
  node_id: string;
  name: string;
  description?: string;
  thumbnail_url?: string;
  style_type?: string;
  containing_frame?: {
    name?: string;
    nodeId?: string;
    pageName?: string;
    containingComponentSet?: { nodeId: string; name: string };
  };
}

export interface DevResource {
  id: string;
  name: string;
  url: string;
  file_key: string;
  node_id: string;
}

type Kind = "components" | "component_sets" | "styles";

export async function publishedInFile(
  token: string,
  fileKey: string,
  kind: Kind,
): Promise<PublishedAsset[]> {
  const data = await figmaFetch<{ meta: Record<string, PublishedAsset[]> }>(
    token,
    `/v1/files/${fileKey}/${kind}`,
  );
  return data.meta[kind] ?? [];
}

/** Team libraries, paginated; capped so one search can't drain the rate limit. */
export async function publishedInTeam(
  token: string,
  teamId: string,
  kind: Kind,
  maxPages = 5,
): Promise<PublishedAsset[]> {
  const out: PublishedAsset[] = [];
  let after: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const data = await figmaFetch<{
      meta: Record<string, PublishedAsset[]> & {
        cursor?: { after?: number | string };
      };
    }>(token, `/v1/teams/${teamId}/${kind}`, {
      query: { page_size: 1000, after },
    });
    out.push(...((data.meta[kind] as PublishedAsset[]) ?? []));
    const next = data.meta.cursor?.after;
    if (!next) break;
    after = String(next);
  }
  return out;
}

/** Resolves published keys to the library file and node that define them. */
export async function resolveKeys(
  token: string,
  keys: Array<{ key: string; kind: "component" | "component_set" | "style" }>,
  limit: number,
): Promise<{ resolved: PublishedAsset[]; skipped: number }> {
  const slice = keys.slice(0, limit);
  const resolved = await mapLimit(slice, 5, async ({ key, kind }) => {
    const path =
      kind === "style"
        ? "styles"
        : kind === "component_set"
          ? "component_sets"
          : "components";
    try {
      return (
        await figmaFetch<{ meta: PublishedAsset }>(token, `/v1/${path}/${key}`)
      ).meta;
    } catch {
      return null; // unpublished or no access
    }
  });
  return {
    resolved: resolved.filter((r): r is PublishedAsset => !!r),
    skipped: Math.max(0, keys.length - limit),
  };
}

export async function fileName(
  token: string,
  fileKey: string,
): Promise<string | undefined> {
  try {
    return (
      await figmaFetch<{ file: { name: string } }>(
        token,
        `/v1/files/${fileKey}/meta`,
      )
    ).file.name;
  } catch {
    return undefined;
  }
}

export async function devResources(
  token: string,
  fileKey: string,
  nodeIds?: string[],
): Promise<DevResource[]> {
  const data = await figmaFetch<{ dev_resources: DevResource[] }>(
    token,
    `/v1/files/${fileKey}/dev_resources`,
    {
      query: { node_ids: nodeIds?.length ? nodeIds.join(",") : undefined },
    },
  );
  return data.dev_resources ?? [];
}
