/**
 * JSON-RPC proxy for Google's official MCP servers.
 *
 * Each Google MCP endpoint (calendarmcp.googleapis.com, gmailmcp..., etc.) speaks
 * JSON-RPC 2.0 over HTTP and authenticates via Bearer tokens. We forward the user's
 * access token and pass through the result/error.
 */

interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: number | string;
  result: unknown;
}

interface JsonRpcError {
  jsonrpc: "2.0";
  id: number | string;
  error: { code: number; message: string; data?: unknown };
}

type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

/**
 * From 2026-11-11 Google's Workspace MCP servers only accept OAuth clients
 * flagged "agentic" (is_agentic) in Google Cloud Console; the rejection says
 * the client "is not marked as an AI agent". Re-authenticating cannot fix
 * that, so it must not be reported as a missing scope.
 */
export function notAgenticError(text: string): Error | null {
  if (!/agentic|ai agent/i.test(text)) return null;
  return new Error(
    `Google rejected this MCP's OAuth client because it is not marked as agentic (is_agentic). ` +
      `Re-authenticating will not help: a Google Cloud admin must enable the agentic setting on the ` +
      `OAuth client (GOOGLE_WORKSPACE_CLIENT_ID, or GOOGLE_CLIENT_ID if unset). Upstream: ${text}`,
  );
}

export async function proxyMcpCall(
  backendUrl: string,
  toolName: string,
  args: unknown,
  accessToken: string,
): Promise<unknown> {
  const body = {
    jsonrpc: "2.0" as const,
    id: crypto.randomUUID(),
    method: "tools/call",
    params: { name: toolName, arguments: args ?? {} },
  };

  const res = await fetch(backendUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    throw new Error(
      `Google ${backendUrl} returned 401 Unauthorized. The access token has been revoked or has expired — please re-authenticate.`,
    );
  }

  if (res.status === 403) {
    const text = await res.text();
    throw (
      notAgenticError(text) ??
      new Error(
        `Google ${backendUrl} returned 403 Forbidden. The token is missing the required scope. Re-authenticate to grant the new permission. Body: ${text}`,
      )
    );
  }

  if (!res.ok) {
    const text = await res.text();
    throw (
      notAgenticError(text) ??
      new Error(
        `Google MCP backend error ${res.status} on ${toolName}: ${text}`,
      )
    );
  }

  const json = (await res.json()) as JsonRpcResponse;

  if ("error" in json) {
    throw (
      notAgenticError(json.error.message) ??
      new Error(
        `Google MCP JSON-RPC error on ${toolName}: ${json.error.message} (code ${json.error.code})`,
      )
    );
  }

  return json.result;
}
