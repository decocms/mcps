/**
 * Tool Step Executor
 *
 * Executes MCP tool calls via connection proxy.
 */

import { ToolCallActionSchema } from "@decocms/bindings/workflow";
import type { Step, StepResult } from "../../types/step.ts";
import type { ExecutionContext } from "../context.ts";
import { executeCode } from "./code-step.ts";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client";
import type { Env } from "../../types/env.ts";

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

export async function executeToolStep(
  ctx: ExecutionContext,
  step: Step,
  input: Record<string, unknown>,
): Promise<StepResult> {
  const startedAt = Date.now();
  const parsed = ToolCallActionSchema.safeParse(step.action);
  if (!parsed.success) {
    throw new Error("Tool step missing tool configuration");
  }

  const { toolName, transformCode } = parsed.data;
  const gatewayId = ctx.gatewayId;

  const transport = createGatewayTransport(gatewayId, ctx.env);
  const client = new Client({
    title: "MCP Studio",
    version: "1.0.0",
    name: "MCP Studio",
    websiteUrl: "https://mcp-studio.com",
    description: "MCP Studio",
    icons: [
      {
        src: "https://mcp-studio.com/icon.png",
        mimeType: "image/png",
      },
    ],
  });
  await client.connect(transport);

  const timeoutMs = step.config?.timeoutMs ?? 30000;

  const { content, structuredContent, isError } = await client.callTool(
    {
      name: toolName,
      arguments: input,
    },
    undefined,
    {
      timeout: timeoutMs,
    },
  );

  const result = structuredContent ?? content;

  // If there's transform code, run it on the raw tool result
  if (transformCode) {
    const transformResult = await executeCode(
      transformCode,
      result as Record<string, unknown>,
      step.name,
    );
    return transformResult;
  }

  // If there's an output schema but no transform, filter the result
  if (step.outputSchema) {
    const outputSchemaProperties = step.outputSchema.properties as Record<
      string,
      unknown
    >;
    const output = outputSchemaProperties
      ? Object.fromEntries(
          Object.entries(result as Record<string, unknown>).filter(
            ([key]) => key in outputSchemaProperties,
          ),
        )
      : (result as Record<string, unknown>);

    return {
      output,
      startedAt,
      error: isError ? JSON.stringify(result) : undefined,
      completedAt: Date.now(),
      stepId: step.name,
    };
  }

  return {
    output: result,
    startedAt,
    error: isError ? JSON.stringify(result) : undefined,
    completedAt: Date.now(),
    stepId: step.name,
  };
}
