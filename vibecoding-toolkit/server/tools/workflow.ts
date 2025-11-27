import z from "zod";
import { callFunction, inspect } from "../cf-sandbox/index.ts";
import { evalCodeAndReturnDefaultHandle, validate } from "./utils.ts";
import type { Env } from "../main.ts";
import { createPrivateTool } from "@decocms/runtime/mastra";

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

function resolveAtRefsInInput(
  input: unknown,
  stepResults: Map<string, unknown>,
  globalInput?: unknown,
): { resolved: unknown; errors?: Array<{ ref: string; error: string }> } {
  const errors: Array<{ ref: string; error: string }> = [];

  function resolveValue(value: unknown): unknown {
    // If it's an @ref, resolve it
    if (isAtRef(value)) {
      const result = resolveAtRef(value, stepResults, globalInput);
      if (result.error) {
        errors.push({ ref: value, error: result.error });
      }
      return result.value;
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

const RetriesSchema = z.object({
  limit: z
    .number()
    .int()
    .min(0)
    .default(2)
    .describe("Number of retry attempts for this step (default: 2)"),
  delay: z
    .number()
    .int()
    .min(0)
    .default(2000)
    .describe("Delay in milliseconds between retry attempts (default: 2000)"),
  backoff: z
    .enum(["constant", "linear", "exponential"])
    .default("exponential")
    .describe("Backoff strategy for retry attempts (default: exponential)"),
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

export const WorkflowStepDefinitionSchema = z.object({
  def: CodeStepDefinitionSchema,
  input: z
    .record(z.unknown())
    .optional()
    .describe(
      "Input object that complies with inputSchema. Values can reference previous steps using @<step_name>.output.property or workflow input using @input.property",
    ),
  output: z
    .record(z.unknown())
    .optional()
    .describe("Execution output of the step (if it has been run)"),
  options: z
    .object({
      retries: RetriesSchema.optional(),
      timeout: z
        .number()
        .positive()
        .default(300_000) // 5 minutes
        .optional()
        .describe(
          "Maximum execution time in milliseconds (default: 5 minutes)",
        ),
    })
    .optional()
    .describe("Options for the step"),
  views: z
    .array(z.string())
    .optional()
    .describe("List of URIs of View Resources that this step can render."),
});

export type WorkflowStepDefinition = z.infer<
  typeof WorkflowStepDefinitionSchema
>;
export interface WorkflowState<T = unknown> {
  input: T;
  steps: Record<string, unknown>;
  sleep: (name: string, duration: number) => Promise<void>;
  sleepUntil: (name: string, date: Date | number) => Promise<void>;
}
const StepSchema = z.object({
  name: z.string(),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.record(z.unknown()),
  execute: z
    .object({
      connectionId: z.string(),
      toolName: z.string(),
    })
    .or(z.string()),
  input: z.record(z.unknown()),
  output: z.record(z.unknown()),
  status: z
    .enum(["pending", "running", "completed", "failed"])
    .default("pending"),
  error: z.string().optional(),
  logs: z.array(z.string()).optional(),
});
export type Step = z.infer<typeof StepSchema>;

export const runWorkflowTool = (env: Env) =>
  createPrivateTool({
    id: "RUN_WORKFLOW",
    description: "Run one or more MCP tools with durable execution",
    inputSchema: z.object({
      input: z.record(z.unknown()),
      // steps: z.array(StepSchema),
      runtimeId: z.string(),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      result: z.unknown(),
    }),
    execute: async ({ context: ctx }) => {
      const state = {
        steps: {} as Record<string, unknown>,
        input: ctx.input,
      };

      const steps: Step[] = [
        {
          name: "step1",
          inputSchema: {
            properties: {
              name: {
                type: "string",
              },
            },
            required: ["name"],
            type: "object",
          },
          outputSchema: {
            properties: {
              upperCaseName: {
                type: "string",
              },
            },
            required: ["upperCaseName"],
            type: "object",
          },
          execute:
            "export default async function (input, ctx) {\nreturn { upperCaseName: input.name.toUpperCase() };\n}",
          input: {
            name: "John Doe",
          },
          output: {},
          error: undefined,
          status: "pending",
          logs: [],
        },
        {
          name: "step2",
          inputSchema: {
            properties: {
              upperCaseName: {
                type: "string",
              },
            },
            required: ["upperCaseName"],
            type: "object",
          },
          outputSchema: {
            properties: {
              duplicateName: {
                type: "string",
              },
            },
            required: ["duplicateName"],
            type: "object",
          },
          execute:
            "export default async function (input, ctx) {\nreturn { duplicateName: input.upperCaseName };\n}",
          input: {
            upperCaseName: "@step1.output.upperCaseName",
          },
          output: {},
          error: undefined,
          status: "pending",
          logs: [],
        },
        {
          name: "step3",
          inputSchema: {},
          outputSchema: {},
          input: {
            model: "anthropic:claude-sonnet-4-5",
            messages: [
              {
                role: "user",
                content: "Generate poem about John Doe",
              },
            ],
            schema: {
              type: "object",
              properties: { poem: { type: "string" } },
            },
            temperature: 0.7,
          },
          output: {},
          logs: [],
          status: "pending",
          error: undefined,
          execute: {
            connectionId: "i:ai-generation",
            toolName: "AI_GENERATE_OBJECT",
          },
        },
      ];

      for (const step of steps) {
        let stepInput = step.input;
        const stepDef = step;
        const stepResultsMap = new Map(Object.entries(state.steps));

        // Debug logging
        console.log(
          `[REF RESOLUTION] Step '${stepDef.name}' input before resolution:`,
          JSON.stringify(stepInput),
        );
        console.log(
          `[REF RESOLUTION] Available step results:`,
          Array.from(stepResultsMap.keys()),
        );

        const resolution = resolveAtRefsInInput(
          stepInput,
          stepResultsMap,
          state.input,
        );

        // Log any resolution errors
        if (resolution.errors && resolution.errors.length > 0) {
          console.error(
            `[REF RESOLUTION] Errors resolving refs in step '${stepDef.name}':`,
            resolution.errors,
          );
        }

        // Use the resolved input
        stepInput = resolution.resolved as Record<string, unknown>;
        console.log(
          `[REF RESOLUTION] Step '${stepDef.name}' input after resolution:`,
          JSON.stringify(stepInput),
        );

        // Validate resolved input against step's inputSchema
        if (stepDef.inputSchema) {
          const inputValidation = validate(
            resolution.resolved,
            stepDef.inputSchema,
          );
          if (!inputValidation.valid) {
            const errorMessage = `Step '${stepDef.name}' input validation failed after ref resolution: ${inspect(
              inputValidation.errors,
            )}`;
            console.error(`[INPUT VALIDATION]`, errorMessage);
            throw new Error(errorMessage);
          }
        }
        if (typeof step.execute === "string") {
          const stepEvaluation = await evalCodeAndReturnDefaultHandle(
            step.execute,
            ctx.runtimeId,
          );

          const {
            ctx: stepCtx,
            defaultHandle: stepDefaultHandle,
            guestConsole: stepConsole,
          } = stepEvaluation;

          const stepCallHandle = await callFunction(
            stepCtx,
            stepDefaultHandle,
            undefined,
            step.input,
          );

          const result = stepCtx.dump(stepCtx.unwrapResult(stepCallHandle));

          // Log any console output from the step execution
          if (stepConsole.logs.length > 0) {
            console.log(`Step '${step.name}' logs:`, stepConsole.logs);
          }

          // Return the full result object (with .result wrapper) so refs can access it
          // Refs use format @step.output.result.X which maps to result.X after stripping output.
          console.log(
            `[STEP EXECUTION] Raw result structure:`,
            JSON.stringify(result),
          );

          step.output = result;
          state.steps[step.name] = result;
          step.status = "completed";
        } else {
          const connection = proxyConnectionForId(step.execute.connectionId, {
            workspace: env.DECO_WORKSPACE,
            token: env.DECO_REQUEST_CONTEXT.token,
          });

          console.log("Connection:", connection);

          const result = await env.INTEGRATIONS.INTEGRATIONS_CALL_TOOL({
            connection: connection as any,
            params: {
              name: step.execute.toolName,
              arguments: step.input,
            },
          });
          console.log("Result:", result);
          step.output = result as Record<string, unknown>;
          step.status = "completed";
        }
      }

      console.log("Steps:", { steps });
      return { success: true, steps };
    },
  });

const cache = new Map<string, unknown>();

// Helper function to create a tool caller
const createToolCaller = (
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

export const workflowTools = [runWorkflowTool];

export const proxyConnectionForId = (
  integrationId: string,
  {
    workspace,
    token,
  }: {
    workspace: string;
    token: string;
  },
  decoChatApiUrl?: string,
  appName?: string,
) => {
  let headers: Record<string, string> | undefined = appName
    ? { "x-caller-app": appName }
    : undefined;
  return {
    type: "HTTP",
    url: createIntegrationsUrl({
      integrationId,
      workspace: workspace,
      decoCmsApiUrl: decoChatApiUrl,
    }),
    token: token,
    headers,
  };
};

interface IntegrationContext {
  integrationId: string;
  workspace: string;
  branch?: string;
  decoCmsApiUrl?: string;
}

const normalizeWorkspace = (workspace: string) => {
  if (workspace.startsWith("/users")) {
    return workspace;
  }
  if (workspace.startsWith("/shared")) {
    return workspace;
  }
  if (workspace.includes("/")) {
    return workspace;
  }
  return `/shared/${workspace}`;
};

const createIntegrationsUrl = ({
  integrationId,
  workspace,
  decoCmsApiUrl,
  branch,
}: IntegrationContext) => {
  const base = `${normalizeWorkspace(workspace)}/${integrationId}/mcp`;
  const url = new URL(base, decoCmsApiUrl ?? "https://api.decocms.com");
  branch && url.searchParams.set("branch", branch);
  return url.href;
};
