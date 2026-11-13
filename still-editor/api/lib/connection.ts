import { proxyConnectionForId } from "@decocms/runtime";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Env } from "../types/env.ts";

type BindingName = "OPENROUTER" | "WAKE" | "OBJECT_STORAGE";

// A binding calls tools with the MCP SDK's 60 s default timeout, and an image
// model can take longer (up to 81 s measured, more with a retry). Studio's
// connection proxy allows 5 minutes, so long calls go through this client.
export async function callConnectionTool(
  env: Env,
  binding: BindingName,
  name: string,
  args: Record<string, unknown>,
  timeoutMs = 60_000,
): Promise<unknown> {
  const ctx = env.MESH_REQUEST_CONTEXT;
  const connectionId = (ctx.state[binding] as unknown as { value: string })
    .value;
  const connection = proxyConnectionForId(connectionId, ctx);
  if (connection.type !== "HTTP") {
    throw new Error(`${binding}: unexpected ${connection.type} connection`);
  }
  const headers: Record<string, string> = {
    ...(connection.token
      ? { authorization: `Bearer ${connection.token}` }
      : {}),
    ...connection.headers,
  };
  const client = new Client({ name: "still-editor", version: "0.1.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(connection.url), {
      requestInit: { headers },
    }),
  );
  try {
    const result = await client.callTool({ name, arguments: args }, undefined, {
      timeout: timeoutMs,
    });
    if (result.isError) {
      const text = (result.content as { type: string; text?: string }[])
        .map((part) => part.text ?? "")
        .join(" ");
      throw new Error(
        `${binding} ${name}: ${text || "tool returned an error"}`,
      );
    }
    if (result.structuredContent) return result.structuredContent;
    const text = (result.content as { type: string; text?: string }[]).find(
      (part) => part.type === "text",
    )?.text;
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      return text;
    }
  } finally {
    await client.close();
  }
}
