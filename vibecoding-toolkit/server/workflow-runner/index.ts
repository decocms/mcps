const cache = new Map<string, unknown>();
import z from "zod";
import type { Env } from "../main.ts";

function isAtRef(value: unknown): value is `@${string}` {
  return typeof value === "string" && value.startsWith("@");
}

function parseAtRef(ref: `@${string}`): {
  type: "step" | "input";
  id?: string;
  path?: string;
} {
  const refStr = ref.substring(1); // Remove @ prefix

  // Input reference: @input.path.to.value
  if (refStr.startsWith("input")) {
    const path = refStr.substring(6); // Remove 'input.'
    return { type: "input", path };
  }

  // Step reference: @stepId.path.to.value
  const [id, ...pathParts] = refStr.split(".");

  // If path starts with 'output.', remove it since stepResults already contains the output
  let path = pathParts.join(".");
  if (path.startsWith("output.")) {
    path = path.substring(7); // Remove 'output.'
  }

  return { type: "step", id, path };
}

function getValue(
  obj: Record<string, unknown> | unknown[] | unknown,
  path: string,
): unknown {
  if (!path) return obj;

  const keys = path.split(".");
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === "object" && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[key];
    } else if (Array.isArray(current)) {
      const index = parseInt(key, 10);
      current = isNaN(index) ? undefined : current[index];
    } else {
      return undefined;
    }
  }

  return current;
}

function resolveAtRef(
  ref: `@${string}`,
  stepResults: Map<string, unknown>,
  globalInput?: unknown,
): { value: unknown; error?: string } {
  try {
    const parsed = parseAtRef(ref);

    switch (parsed.type) {
      case "input": {
        const value = getValue(
          (globalInput as Record<string, unknown>) || {},
          parsed.path || "",
        );
        if (value === undefined) {
          return {
            value: null,
            error: `Input path not found: ${parsed.path}`,
          };
        }
        return { value };
      }

      case "step": {
        const identifier = parsed.id || "";
        const stepResult = stepResults.get(identifier);

        if (stepResult === undefined) {
          return {
            value: null,
            error: `Step not found or not executed: ${identifier}`,
          };
        }
        const value = getValue(stepResult, parsed.path || "");
        if (value === undefined) {
          return {
            value: null,
            error: `Path not found in step result: ${parsed.path}`,
          };
        }
        return { value };
      }

      default:
        return { value: null, error: `Unknown reference type: ${ref}` };
    }
  } catch (error) {
    return {
      value: null,
      error: `Failed to resolve ${ref}: ${String(error)}`,
    };
  }
}

export function resolveAtRefsInInput(
  input: unknown,
  stepResults: Map<string, unknown>,
  globalInput?: unknown,
): { resolved: unknown; errors?: Array<{ ref: string; error: string }> } {
  const errors: Array<{ ref: string; error: string }> = [];

  const AT_REF_PATTERN =
    /@([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)/g;

  function resolveValue(value: unknown): unknown {
    // If it's a string that IS an @ref (entire value)
    if (isAtRef(value)) {
      const result = resolveAtRef(value, stepResults, globalInput);
      if (result.error) {
        errors.push({ ref: value, error: result.error });
      }
      return result.value;
    }

    // If it's a string that CONTAINS @refs, interpolate them
    if (typeof value === "string" && value.includes("@")) {
      return value.replace(AT_REF_PATTERN, (match) => {
        if (isAtRef(match as `@${string}`)) {
          const result = resolveAtRef(
            match as `@${string}`,
            stepResults,
            globalInput,
          );
          if (result.error) {
            errors.push({ ref: match, error: result.error });
            return match; // Keep original if resolution fails
          }
          return String(result.value ?? "");
        }
        return match;
      });
    }

    // If it's an array, resolve each element
    if (Array.isArray(value)) {
      return value.map((v) => resolveValue(v));
    }

    // If it's an object, resolve each property
    if (value !== null && typeof value === "object") {
      const resolvedObj: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        resolvedObj[key] = resolveValue(val);
      }
      return resolvedObj;
    }

    // Primitive value, return as-is
    return value;
  }

  const resolved = resolveValue(input);
  return { resolved, errors: errors.length > 0 ? errors : undefined };
}

export const ToolDependencySchema = z.object({
  integrationId: z
    .string()
    .min(1)
    .describe(
      "The integration ID (format: i:<uuid> or a:<uuid>) that this depends on",
    ),
  toolNames: z
    .array(z.string().min(1))
    .min(1)
    .describe("List of tool names from this integration that will be used."),
});

// Code step definition - includes both definition and execution state
export const CodeStepDefinitionSchema = z.object({
  name: z
    .string()
    .min(1)
    .describe("The unique name of the step within the workflow"),
  title: z.string().optional().describe("The title of the step"),
  description: z
    .string()
    .min(1)
    .describe("A clear description of what this step does"),
  inputSchema: z
    .object({})
    .passthrough()
    .optional()
    .describe("JSON Schema defining the input structure for this step"),
  outputSchema: z
    .object({})
    .passthrough()
    .optional()
    .describe("JSON Schema defining the output structure for this step"),
  execute: z
    .string()
    .min(1)
    .describe(
      "ES module code that exports a default async function: (input: typeof inputSchema, ctx: { env: Record<string, any> }) => Promise<typeof outputSchema>. The input parameter contains the resolved input with all @ references replaced with actual values.",
    ),
  dependencies: z
    .array(ToolDependencySchema)
    .optional()
    .describe(
      "List of integration dependencies with specific tools. These integrations and their tools must be installed and available for the step to execute successfully. Tools are accessible via ctx.env['{INTEGRATION_ID}']['{TOOL_NAME}'](). Use READ_MCP to find available integration IDs and their tools.",
    ),
});

export interface WorkflowState<T = unknown> {
  input: T;
  steps: Record<string, unknown>;
  sleep: (name: string, duration: number) => Promise<void>;
  sleepUntil: (name: string, date: Date | number) => Promise<void>;
}
export const StepSchema = z.object({
  name: z.string(),
  inputSchema: z.record(z.unknown()).optional(), // Make optional since not all steps need it
  outputSchema: z.record(z.unknown()).optional(),
  execute: z
    .object({
      connectionId: z.string(),
      toolName: z.string(),
    })
    .or(z.string()),
  input: z.record(z.unknown()).optional(), // ← ADD THIS LINE
  status: z
    .enum(["pending", "running", "completed", "failed"])
    .default("pending"),
  error: z.string().optional(),
  logs: z.array(z.string()).optional(),
});
export type Step = z.infer<typeof StepSchema>;

// Helper function to create a tool caller
export const createToolCaller = (
  env: Env,
  integrationId: string,
  toolName: string,
) => {
  return async (args: Record<string, unknown>) => {
    let connection;
    connection = cache.get(integrationId);
    if (!connection) {
      const mConnection:
        | {
            connection?: Record<string, unknown>;
          }
        | unknown = await env.INTEGRATIONS.INTEGRATIONS_GET({
        id: integrationId,
      });
      cache.set(integrationId, mConnection);
    }
    connection = cache.get(integrationId);

    const response:
      | {
          structuredContent?: Record<string, unknown>;
          content?: string;
        }
      | unknown = await env.INTEGRATIONS.INTEGRATIONS_CALL_TOOL({
      connection: connection as any,
      params: {
        name: toolName,
        arguments: args,
      },
    });

    if (
      typeof response === "object" &&
      response !== null &&
      "structuredContent" in response
    ) {
      return response.structuredContent;
    } else if (
      typeof response === "object" &&
      response !== null &&
      "content" in response
    ) {
      return response.content;
    } else {
      return response;
    }
  };
};
