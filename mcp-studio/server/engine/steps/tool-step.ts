/**
 * Tool Step Executor
 *
 * Executes MCP tool calls via connection proxy.
 */

import { ToolCallActionSchema } from "@decocms/bindings/workflow";
import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Env } from "../../types/env.ts";
import type { Step, StepResult } from "../../types/step.ts";
import type { ExecutionContext } from "../context.ts";
import { executeCode } from "./code-step.ts";

const fixProtocol = (url: URL) => {
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (!isLocal) {
    // force http if not local
    url.protocol = "https:";
  }
  return url;
};

function createGatewayTransport(
  gatewayId: string,
  env: Env,
): StreamableHTTPClientTransport {
  // Build base URL for gateway
  const url = fixProtocol(
    new URL(`${env.MESH_REQUEST_CONTEXT?.meshUrl}/mcp/gateway/${gatewayId}`),
  );

  const headers = new Headers();
  headers.set(
    "Authorization",
    `Bearer ${env.MESH_REQUEST_CONTEXT?.token || ""}`,
  );

  return new StreamableHTTPClientTransport(url, { requestInit: { headers } });
}

const MCP_CLIENT_INFO = {
  name: "MCP Studio",
  version: "1.0.0",
  title: "MCP Studio",
  description: "MCP Studio",
  websiteUrl: "https://mcp-studio.com",
  icons: [{ src: "https://mcp-studio.com/icon.png", mimeType: "image/png" }],
};

const DEFAULT_TIMEOUT_MS = 60000;

/**
 * Execute the tool call and return the raw result.
 * Throws on tool errors.
 */
async function invokeToolCall(
  client: Client,
  toolName: string,
  args: Record<string, unknown>,
  timeoutMs: number,
): Promise<unknown> {
  const { content, structuredContent, isError } = await client.callTool(
    { name: toolName, arguments: args },
    undefined,
    { timeout: timeoutMs },
  );

  const result = structuredContent ?? content;

  if (isError) {
    const errorMessage =
      typeof result === "string" ? result : JSON.stringify(result, null, 2);
    throw new Error(`Tool "${toolName}" returned an error: ${errorMessage}`);
  }

  return result;
}

/**
 * Filter result to only include properties defined in the output schema.
 */
function filterResultBySchema(
  result: unknown,
  outputSchema: Step["outputSchema"],
): Record<string, unknown> {
  if (!outputSchema?.properties || typeof result !== "object" || !result) {
    return (result as Record<string, unknown>) ?? {};
  }

  const allowedKeys = new Set(Object.keys(outputSchema.properties));
  return Object.fromEntries(
    Object.entries(result as Record<string, unknown>).filter(([key]) =>
      allowedKeys.has(key),
    ),
  );
}

/**
 * Create a step result with timing information.
 */
function createStepResult(
  stepId: string,
  startedAt: number,
  output?: unknown,
  error?: string,
): StepResult {
  return {
    stepId,
    startedAt,
    completedAt: Date.now(),
    ...(error !== undefined ? { error } : { output }),
  };
}

export async function executeToolStep(
  ctx: ExecutionContext,
  step: Step,
  input: Record<string, unknown>,
): Promise<StepResult> {
  const startedAt = Date.now();

  // Validate step action schema
  const parsed = ToolCallActionSchema.safeParse(step.action);
  if (!parsed.success) {
    return createStepResult(
      step.name,
      startedAt,
      undefined,
      `Invalid tool step configuration: ${parsed.error.message}`,
    );
  }

  const { toolName, transformCode } = parsed.data;
  const timeoutMs = step.config?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Create MCP client
  const transport = createGatewayTransport(ctx.gatewayId, ctx.env);
  const client = new Client(MCP_CLIENT_INFO);

  // Execute tool call and disconnect immediately
  let result: unknown;
  try {
    console.log("connecting to client");
    await client.connect(transport);
    result = await invokeToolCall(client, toolName, input, timeoutMs);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // Fire-and-forget close on error
    client.close().catch(() => {});
    return createStepResult(step.name, startedAt, undefined, errorMessage);
  }

  // Fire-and-forget close - don't block on disconnect
  client.close().catch(() => {});

  // Post-processing happens after client is disconnected
  if (transformCode) {
    const transformResult = await executeCode(
      transformCode,
      result as Record<string, unknown>,
      step.name,
    );
    return {
      ...transformResult,
      startedAt,
      completedAt: Date.now(),
    };
  }

  const output = step.outputSchema
    ? filterResultBySchema(result, step.outputSchema)
    : result;

  return createStepResult(step.name, startedAt, output);
}
