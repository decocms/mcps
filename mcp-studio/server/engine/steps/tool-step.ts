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

  // Forward cookie and authorization headers
  console.log(
    "env.MESH_REQUEST_CONTEXT?.token",
    env.MESH_REQUEST_CONTEXT?.token,
  );
  console.log(
    "env.MESH_REQUEST_CONTEXT?.meshUrl",
    env.MESH_REQUEST_CONTEXT?.meshUrl,
  );
  console.log("env.MESH_REQUEST_CONTEXT", env.MESH_REQUEST_CONTEXT);
  console.log("gatewayId", gatewayId);
  console.log("url", url);
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
  const client = new Client(
    {
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
    },
    {},
  );
  await client.connect(transport);

  const timeoutMs = step.config?.timeoutMs ?? 30000;

  const result = await client.callTool(
    {
      name: toolName,
      arguments: input,
    },
    undefined,
    {
      timeout: timeoutMs,
    },
  );

  console.log("result", result.content);
  console.log("result", result.structuredContent);

  if (step.outputSchema) {
    // return only fields that are in the output schema
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

    if (transformCode) {
      const transformResult = await executeCode(
        transformCode,
        output,
        step.name,
      );
      return transformResult;
    }
  }

  return {
    output: result,
    startedAt,
    completedAt: Date.now(),
    stepId: step.name,
  };
}
