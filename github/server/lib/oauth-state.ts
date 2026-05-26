/**
 * Parse Mesh-encoded OAuth client `state` for GitHub-specific parameters.
 *
 * Studio sends `mesh:<base64url(json)>` as the MCP OAuth client state when it
 * needs repository-scoped tokens (`repositoryId`).
 */

export interface MeshOAuthClientState {
  repositoryId?: number;
}

export function parseMeshOAuthClientState(
  clientState?: string | null,
): MeshOAuthClientState {
  if (!clientState?.startsWith("mesh:")) return {};

  try {
    const encoded = clientState.slice("mesh:".length);
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const parsed = JSON.parse(atob(padded)) as { repositoryId?: unknown };
    if (
      typeof parsed.repositoryId === "number" &&
      Number.isFinite(parsed.repositoryId)
    ) {
      return { repositoryId: parsed.repositoryId };
    }
  } catch {
    // Ignore malformed state — treat as unscoped OAuth.
  }

  return {};
}

export function encodeMeshOAuthClientState(
  state: MeshOAuthClientState,
): string {
  const json = JSON.stringify(state);
  const base64 = btoa(json)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `mesh:${base64}`;
}
