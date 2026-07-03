/**
 * Persistent mesh API key for background work. The request JWT expires in
 * ~5 minutes; the worker needs to call mesh (bindings, VM tools, decopilot)
 * for hours. On onChange we mint an org API key via API_KEY_CREATE on
 * /mcp/self, granting access to self + this connection + the binding
 * connections, and persist it in sitemig_connections.
 *
 * Same idea as shared/api-key-manager.ts, with custom permission grants.
 */

import { resolveMeshUrl } from "./mesh.ts";

export const API_KEY_GRANTS_STATE_KEY = "__API_KEY_GRANTS";

export function desiredGrants(input: {
  connectionId: string;
  bindingConnectionIds: string[];
}): string[] {
  return ["self", input.connectionId, ...input.bindingConnectionIds].filter(
    (v, i, arr) => arr.indexOf(v) === i,
  );
}

export function grantsChanged(previous: unknown, desired: string[]): boolean {
  if (!Array.isArray(previous)) return true;
  const prev = new Set(previous as string[]);
  return desired.some((g) => !prev.has(g));
}

export async function mintPersistentApiKey(input: {
  meshUrl: string;
  organizationId: string;
  connectionId: string;
  temporaryToken: string;
  grants: string[];
}): Promise<string | null> {
  const base = resolveMeshUrl(input.meshUrl);
  const permissions: Record<string, string[]> = {};
  for (const grant of input.grants) permissions[grant] = ["*"];

  try {
    const response = await fetch(`${base}/mcp/self`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${input.temporaryToken}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: "API_KEY_CREATE",
          arguments: {
            name: `tanstack-migrator-${input.connectionId}`,
            permissions,
            metadata: {
              purpose: "tanstack-migrator background worker",
              connectionId: input.connectionId,
              organization: { id: input.organizationId },
              createdAt: new Date().toISOString(),
            },
          },
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      console.error(
        `[api-key] API_KEY_CREATE failed: ${response.status} ${await response.text().then((t) => t.slice(0, 200))}`,
      );
      return null;
    }

    const raw = await response.text();
    const payload = JSON.parse(
      raw.trim().startsWith("{")
        ? raw
        : (raw
            .split("\n")
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trim())
            .findLast((l) => l && l !== "[DONE]") ?? "{}"),
    ) as {
      result?: {
        structuredContent?: { key?: string };
        content?: Array<{ type: string; text?: string }>;
      };
      error?: { message: string };
    };

    if (payload.error) {
      console.error(`[api-key] API_KEY_CREATE error: ${payload.error.message}`);
      return null;
    }
    const direct = payload.result?.structuredContent?.key;
    if (direct) return direct;

    const text = payload.result?.content?.find((c) => c.type === "text")?.text;
    if (text) {
      try {
        const parsed = JSON.parse(text) as { key?: string };
        if (parsed.key) return parsed.key;
      } catch {
        // not JSON
      }
    }
    return null;
  } catch (err) {
    console.error(
      "[api-key] mint failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
