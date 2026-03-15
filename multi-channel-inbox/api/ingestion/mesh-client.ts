import type { Env } from "../types/env.ts";

interface MeshToolCallResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

export async function callMeshTool(
  env: Env,
  connectionId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<MeshToolCallResult> {
  const ctx = env.MESH_REQUEST_CONTEXT;
  if (!ctx) throw new Error("No MESH_REQUEST_CONTEXT available");

  const response = await fetch(`${ctx.meshUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ctx.token}`,
      "x-connection-id": connectionId,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
      },
    }),
  });

  const data = (await response.json()) as {
    result?: MeshToolCallResult;
    error?: { message: string };
  };

  if (data.error) {
    throw new Error(`Mesh tool call failed: ${data.error.message}`);
  }

  return data.result!;
}

export function extractTextFromResult(result: MeshToolCallResult): string {
  const textBlock = result.content?.find((c) => c.type === "text");
  return textBlock?.text ?? "";
}

export function parseJsonFromResult<T>(result: MeshToolCallResult): T {
  const text = extractTextFromResult(result);
  return JSON.parse(text) as T;
}
