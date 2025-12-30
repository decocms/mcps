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

type JSONSchema = {
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  oneOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  allOf?: JSONSchema[];
};

/**
 * Coerce a value to match the expected type from a JSON Schema.
 * Handles common cases like string "5" -> number 5.
 */
function coerceValue(value: unknown, schema: JSONSchema | undefined): unknown {
  if (value === undefined || value === null || !schema) return value;

  const schemaType = Array.isArray(schema.type) ? schema.type[0] : schema.type;

  // Handle union types (oneOf/anyOf) - try to find a matching type
  if (schema.oneOf || schema.anyOf) {
    const variants = schema.oneOf || schema.anyOf;
    for (const variant of variants!) {
      const coerced = coerceValue(value, variant);
      if (coerced !== value) return coerced;
    }
    return value;
  }

  // String to number coercion
  if (schemaType === "number" || schemaType === "integer") {
    if (typeof value === "string") {
      const num = Number(value);
      if (!isNaN(num)) return num;
    }
    return value;
  }

  // String to boolean coercion
  if (schemaType === "boolean") {
    if (typeof value === "string") {
      if (value === "true") return true;
      if (value === "false") return false;
    }
    return value;
  }

  // Array coercion
  if (schemaType === "array" && Array.isArray(value) && schema.items) {
    return value.map((item) => coerceValue(item, schema.items));
  }

  // Object coercion - recursively coerce properties
  if (
    schemaType === "object" &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    schema.properties
  ) {
    const coerced: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      coerced[k] = coerceValue(v, schema.properties[k]);
    }
    return coerced;
  }

  return value;
}

/**
 * Clean up input to prevent common validation errors.
 * Removes empty objects that would fail schema validation.
 * Optionally coerces types based on the tool's input schema.
 */
function sanitizeInput(
  input: Record<string, unknown>,
  inputSchema?: JSONSchema,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    // Skip undefined values
    if (value === undefined) continue;

    // Handle 'where' clause - if it's an empty object or missing required fields, skip it
    if (key === "where" && typeof value === "object" && value !== null) {
      const whereObj = value as Record<string, unknown>;
      // Empty where object - skip entirely
      if (Object.keys(whereObj).length === 0) continue;
      // Where object without operator - skip (would fail validation)
      if (!("operator" in whereObj)) {
        console.warn(
          `[TOOL_STEP] Skipping invalid 'where' clause: missing 'operator'. Use { field: [...], operator: "eq"|"gt"|..., value: ... } for simple conditions or { operator: "and"|"or"|"not", conditions: [...] } for logical conditions.`,
        );
        continue;
      }
    }

    // Get the property schema for type coercion
    const propSchema = inputSchema?.properties?.[key];

    // Recursively clean nested objects
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const cleaned = sanitizeInput(
        value as Record<string, unknown>,
        propSchema,
      );
      if (Object.keys(cleaned).length > 0) {
        sanitized[key] = cleaned;
      }
    } else {
      // Coerce the value based on schema
      sanitized[key] = coerceValue(value, propSchema);
    }
  }

  return sanitized;
}

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

  // Fetch tool schema for type coercion
  let inputSchema: JSONSchema | undefined;
  try {
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === toolName);
    inputSchema = tool?.inputSchema as JSONSchema | undefined;
  } catch {
    // If we can't get the schema, proceed without type coercion
  }

  // Sanitize input and coerce types based on tool schema
  const sanitizedInput = sanitizeInput(input, inputSchema);

  const timeoutMs = step.config?.timeoutMs ?? 30000;

  const { content, structuredContent, isError } = await client.callTool(
    {
      name: toolName,
      arguments: sanitizedInput,
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
