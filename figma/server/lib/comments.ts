import { type FigmaNode, figmaFetch, subtreeIds } from "./figma.ts";

interface FigmaComment {
  id: string;
  message: string;
  parent_id?: string;
  created_at: string;
  resolved_at?: string | null;
  user?: { handle?: string };
  client_meta?: { node_id?: string; x?: number; y?: number } | null;
}

export async function listComments(
  token: string,
  fileKey: string,
): Promise<FigmaComment[]> {
  const data = await figmaFetch<{ comments: FigmaComment[] }>(
    token,
    `/v1/files/${fileKey}/comments`,
    {
      query: { as_md: true },
    },
  );
  return data.comments ?? [];
}

/**
 * Comments that belong to a subtree: pinned to one of its nodes, or dropped on
 * the canvas inside its bounds. Replies follow their thread.
 */
export function commentsFor(
  comments: FigmaComment[],
  root?: FigmaNode,
  includeResolved = false,
): FigmaComment[] {
  const ids = root ? subtreeIds(root) : undefined;
  const box = root?.absoluteBoundingBox;
  const inside = (c: FigmaComment) => {
    const meta = c.client_meta;
    if (!root) return true;
    if (meta?.node_id) return ids!.has(meta.node_id);
    if (box && meta?.x != null && meta?.y != null) {
      return (
        meta.x >= box.x &&
        meta.x <= box.x + box.width &&
        meta.y >= box.y &&
        meta.y <= box.y + box.height
      );
    }
    return false;
  };
  const threads = new Set(
    comments
      .filter(
        (c) => !c.parent_id && (includeResolved || !c.resolved_at) && inside(c),
      )
      .map((c) => c.id),
  );
  return comments.filter(
    (c) => threads.has(c.id) || (c.parent_id && threads.has(c.parent_id)),
  );
}

export function formatComments(
  comments: FigmaComment[],
  root?: FigmaNode,
): string {
  if (!comments.length) return "";
  const names = new Map<string, string>();
  if (root) {
    const stack = [root];
    while (stack.length) {
      const n = stack.pop()!;
      names.set(n.id, n.name);
      stack.push(...(n.children ?? []));
    }
  }
  const replies = new Map<string, FigmaComment[]>();
  for (const c of comments) {
    if (c.parent_id)
      replies.set(c.parent_id, [...(replies.get(c.parent_id) ?? []), c]);
  }
  const lines: string[] = [];
  for (const c of comments.filter((c) => !c.parent_id)) {
    const node = c.client_meta?.node_id;
    const where = node
      ? `[${node}${names.has(node) ? ` "${names.get(node)}"` : ""}] `
      : "";
    lines.push(
      `- ${where}@${c.user?.handle ?? "?"} (${c.created_at.slice(0, 10)})${c.resolved_at ? " [resolved]" : ""}: ${c.message}`,
    );
    for (const r of replies.get(c.id) ?? [])
      lines.push(`  ↳ @${r.user?.handle ?? "?"}: ${r.message}`);
  }
  return lines.join("\n");
}
