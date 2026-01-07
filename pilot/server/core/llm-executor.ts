/**
 * LLM Workflow Executor
 *
 * Simplified executor for running LLM-based workflows.
 * No file-based storage - results are returned directly.
 * Execution tracking is done via PostgreSQL (execution-adapter).
 */

import {
  type Workflow,
  type Step,
  resolveRefs,
  groupStepsByLevel,
} from "../types/workflow.ts";
import { loadWorkflow, listWorkflows } from "./workflow-studio-adapter.ts";
import { getAllLocalTools } from "../tools/index.ts";

// ============================================================================
// Types
// ============================================================================

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: unknown;
}

export type LLMCallback = (
  model: string,
  messages: Array<{ role: string; content: string }>,
  tools: Array<{ name: string; description: string; inputSchema: unknown }>,
) => Promise<{
  text?: string;
  toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
}>;

export type MeshToolCallback = (
  connectionId: string,
  toolName: string,
  args: Record<string, unknown>,
) => Promise<unknown>;

export type ListConnectionsCallback = () => Promise<
  Array<{
    id: string;
    title: string;
    tools: Array<{ name: string; description?: string; inputSchema?: unknown }>;
  }>
>;

export interface ExecutorConfig {
  fastModel: string;
  smartModel: string;
  onProgress?: (stepName: string, message: string) => void;
}

export interface ExecutionContext {
  workflow: Workflow;
  workflowInput: Record<string, unknown>;
  stepOutputs: Record<string, unknown>;
  config: ExecutorConfig;
  callLLM: LLMCallback;
  callMeshTool: MeshToolCallback;
  listConnections: ListConnectionsCallback;
  publishEvent?: (type: string, data: Record<string, unknown>) => Promise<void>;
  toolCache: Map<string, ToolDefinition>;
}

export interface WorkflowResult {
  success: boolean;
  response?: string;
  output?: unknown;
  error?: string;
}

// ============================================================================
// Main Executor
// ============================================================================

/**
 * Run a workflow and return the result
 */
export async function runWorkflow(
  workflowId: string,
  input: Record<string, unknown>,
  options: {
    config: ExecutorConfig;
    callLLM: LLMCallback;
    callMeshTool: MeshToolCallback;
    listConnections: ListConnectionsCallback;
    publishEvent?: (
      type: string,
      data: Record<string, unknown>,
    ) => Promise<void>;
  },
): Promise<WorkflowResult> {
  const workflow = await loadWorkflow(workflowId);
  if (!workflow) {
    return { success: false, error: `Workflow not found: ${workflowId}` };
  }

  return runWorkflowDirect(workflow, input, options);
}

/**
 * Run a workflow directly (already loaded)
 */
export async function runWorkflowDirect(
  workflow: Workflow,
  input: Record<string, unknown>,
  options: {
    config: ExecutorConfig;
    callLLM: LLMCallback;
    callMeshTool: MeshToolCallback;
    listConnections: ListConnectionsCallback;
    publishEvent?: (
      type: string,
      data: Record<string, unknown>,
    ) => Promise<void>;
  },
): Promise<WorkflowResult> {
  const ctx: ExecutionContext = {
    workflow,
    workflowInput: input,
    stepOutputs: {},
    config: options.config,
    callLLM: options.callLLM,
    callMeshTool: options.callMeshTool,
    listConnections: options.listConnections,
    publishEvent: options.publishEvent,
    toolCache: new Map(),
  };

  try {
    options.config.onProgress?.("_start", `▶️ ${workflow.title}`);

    // Execute steps by level (parallel within level)
    const stepLevels = groupStepsByLevel(workflow.steps);

    for (const levelSteps of stepLevels) {
      const results = await Promise.all(
        levelSteps.map((step) => executeStep(step, ctx)),
      );

      // Store outputs
      for (let i = 0; i < levelSteps.length; i++) {
        const { output, skipped } = results[i];
        if (!skipped) {
          ctx.stepOutputs[levelSteps[i].name] = output;
        }
      }
    }

    // Get final output from last step
    let finalOutput: unknown;
    for (let i = workflow.steps.length - 1; i >= 0; i--) {
      const stepOutput = ctx.stepOutputs[workflow.steps[i].name];
      if (stepOutput !== undefined) {
        finalOutput = stepOutput;
        break;
      }
    }

    options.config.onProgress?.("_end", `✅ ${workflow.title}`);

    // Extract response from output
    const response = extractResponse(finalOutput);

    return { success: true, response, output: finalOutput };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    options.config.onProgress?.("_error", `❌ ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

// ============================================================================
// Step Execution
// ============================================================================

async function executeStep(
  step: Step,
  ctx: ExecutionContext,
): Promise<{ output: unknown; skipped: boolean }> {
  // Check skipIf condition
  if (step.config?.skipIf) {
    const shouldSkip = evaluateSkipIf(step.config.skipIf, {
      input: ctx.workflowInput,
      steps: ctx.stepOutputs,
    });
    if (shouldSkip) {
      ctx.config.onProgress?.(step.name, `⏭️ Skipped`);
      return { output: null, skipped: true };
    }
  }

  // Resolve input references
  const resolvedInput = resolveRefs(step.input || {}, {
    input: ctx.workflowInput,
    steps: ctx.stepOutputs,
  }) as Record<string, unknown>;

  ctx.config.onProgress?.(step.name, `▶️ ${step.description || step.name}`);

  let output: unknown;

  switch (step.action.type) {
    case "tool":
      output = await executeToolStep(step, resolvedInput, ctx);
      break;
    case "code":
      output = await executeCodeStep(step, resolvedInput, ctx);
      break;
    case "llm":
      output = await executeLLMStep(step, resolvedInput, ctx);
      break;
    case "template":
      output = executeTemplateStep(step, ctx);
      break;
    default:
      throw new Error(
        `Unknown step type: ${(step.action as { type: string }).type}`,
      );
  }

  ctx.config.onProgress?.(step.name, `✅ Done`);
  return { output, skipped: false };
}

// ============================================================================
// Step Type Executors
// ============================================================================

async function executeToolStep(
  step: Step,
  resolvedInput: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<unknown> {
  if (step.action.type !== "tool") throw new Error("Not a tool step");

  const { toolName, connectionId } = step.action;

  // Find connection if not specified
  let connId = connectionId;
  if (!connId) {
    const connections = await ctx.listConnections();
    const conn = connections.find((c) =>
      c.tools.some((t) => t.name === toolName),
    );
    if (conn) connId = conn.id;
  }

  if (!connId) {
    throw new Error(`Could not find connection for tool: ${toolName}`);
  }

  return ctx.callMeshTool(connId, toolName, resolvedInput);
}

async function executeCodeStep(
  step: Step,
  resolvedInput: Record<string, unknown>,
  _ctx: ExecutionContext,
): Promise<unknown> {
  if (step.action.type !== "code") throw new Error("Not a code step");

  const code = step.action.code;

  try {
    const fn = new Function(
      "input",
      `
      const exports = {};
      ${code.replace(/export\s+default\s+/g, "exports.default = ")}
      return exports.default(input);
    `,
    );
    return fn(resolvedInput);
  } catch (error) {
    throw new Error(
      `Code execution failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function executeTemplateStep(step: Step, ctx: ExecutionContext): unknown {
  if (step.action.type !== "template") throw new Error("Not a template step");

  const result = resolveRefs(
    { response: step.action.template },
    { input: ctx.workflowInput, steps: ctx.stepOutputs },
  ) as { response: string };

  return { response: result.response };
}

async function executeLLMStep(
  step: Step,
  resolvedInput: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<{ response?: string; [key: string]: unknown }> {
  if (step.action.type !== "llm") throw new Error("Not an LLM step");

  const {
    prompt,
    model,
    systemPrompt,
    tools,
    maxIterations = 10,
  } = step.action;

  const modelId =
    model === "fast" ? ctx.config.fastModel : ctx.config.smartModel;
  const modelEmoji = model === "fast" ? "⚡" : "🧠";

  ctx.config.onProgress?.(
    step.name,
    `${modelEmoji} ${model?.toUpperCase() || "LLM"}: Thinking...`,
  );

  // Build messages
  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  // Add history if available
  const history = resolvedInput.history as
    | Array<{ role: string; content: string }>
    | undefined;
  if (history) {
    messages.push(...history.slice(-6)); // Last 6 messages
  }

  // Add the prompt
  const resolvedPrompt =
    typeof prompt === "string"
      ? (resolveRefs(prompt, {
          input: ctx.workflowInput,
          steps: ctx.stepOutputs,
        }) as string)
      : String(resolvedInput.message || "");

  messages.push({ role: "user", content: resolvedPrompt });

  // Gather tools
  const toolDefs = await gatherTools(tools, resolvedInput, ctx);

  ctx.config.onProgress?.(
    step.name,
    `${modelEmoji} ${toolDefs.length} tools available`,
  );

  // Run LLM loop
  for (let i = 0; i < maxIterations; i++) {
    const result = await ctx.callLLM(modelId, messages, toolDefs);

    // No tool calls = final response
    if (!result.toolCalls || result.toolCalls.length === 0) {
      const parsed = parseStructuredOutput(result.text || "");
      return {
        ...parsed,
        response: parsed.response || result.text || "(No response)",
      };
    }

    // Process tool calls
    for (const tc of result.toolCalls) {
      ctx.config.onProgress?.(step.name, `🔧 ${tc.name}...`);

      try {
        const toolResult = await executeToolCall(tc.name, tc.arguments, ctx);
        const resultStr = JSON.stringify(toolResult, null, 2);

        messages.push({
          role: "assistant",
          content: result.text || `Calling ${tc.name}...`,
        });
        messages.push({
          role: "user",
          content: `[Tool Result for ${tc.name}]:\n${resultStr.slice(0, 3000)}`,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Tool failed";
        messages.push({
          role: "user",
          content: `[Tool Error for ${tc.name}]: ${errorMsg}`,
        });
      }
    }
  }

  // Reached iteration limit
  ctx.config.onProgress?.(step.name, `⚠️ Iteration limit, summarizing...`);

  messages.push({
    role: "user",
    content:
      "You've reached the iteration limit. Please summarize your findings.",
  });

  const summaryResult = await ctx.callLLM(modelId, messages, []);
  return { response: summaryResult.text || "Reached iteration limit." };
}

// ============================================================================
// Tool Gathering & Execution
// ============================================================================

async function gatherTools(
  toolsConfig: "all" | "discover" | "meta" | "none" | string[] | undefined,
  resolvedInput: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ToolDefinition[]> {
  if (toolsConfig === "none" || !toolsConfig) {
    return [];
  }

  // Meta mode: only discovery and execution tools (no direct tool access)
  if (toolsConfig === "meta") {
    return [
      {
        name: "list_workflows",
        description: "List available workflows that can be executed",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "start_workflow",
        description: "Start a workflow by ID with optional input",
        inputSchema: {
          type: "object",
          properties: {
            workflowId: {
              type: "string",
              description: "The workflow ID to execute",
            },
            input: {
              type: "object",
              description: "Input data for the workflow",
            },
          },
          required: ["workflowId"],
        },
      },
      {
        name: "list_tools",
        description:
          "List all available tools from connected MCPs. Returns tool names and descriptions.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "call_tool",
        description:
          "Call a specific tool by name with arguments. Use list_tools first to discover available tools.",
        inputSchema: {
          type: "object",
          properties: {
            toolName: {
              type: "string",
              description: "Name of the tool to call",
            },
            arguments: {
              type: "object",
              description: "Arguments to pass to the tool",
            },
          },
          required: ["toolName"],
        },
      },
    ];
  }

  // Resolve reference if needed
  let resolvedToolsConfig = toolsConfig;
  if (typeof toolsConfig === "string" && toolsConfig.startsWith("@")) {
    const resolved = resolveRefs(toolsConfig, {
      input: ctx.workflowInput,
      steps: ctx.stepOutputs,
    });
    if (Array.isArray(resolved)) {
      resolvedToolsConfig = resolved as string[];
    }
  }

  // If specific tools provided, look them up
  if (Array.isArray(resolvedToolsConfig)) {
    const tools: ToolDefinition[] = [];
    for (const name of resolvedToolsConfig) {
      const cached = ctx.toolCache.get(name);
      if (cached) {
        tools.push(cached);
      } else {
        // Try local tools first
        const localTools = getAllLocalTools();
        const localTool = localTools.find((t) => t.name === name);
        if (localTool) {
          const def: ToolDefinition = {
            name: localTool.name,
            description: localTool.description || "",
            inputSchema: localTool.inputSchema || { type: "object" },
          };
          tools.push(def);
          ctx.toolCache.set(name, def);
          continue;
        }

        // Try mesh connections
        const connections = await ctx.listConnections();
        for (const conn of connections) {
          const tool = conn.tools.find((t) => t.name === name);
          if (tool) {
            const def: ToolDefinition = {
              name: tool.name,
              description: tool.description || "",
              inputSchema: tool.inputSchema || { type: "object" },
            };
            tools.push(def);
            ctx.toolCache.set(name, def);
            break;
          }
        }
      }
    }
    return tools;
  }

  // For "all" or "discover", get all available tools
  const allTools: ToolDefinition[] = [];

  // Local tools
  for (const tool of getAllLocalTools()) {
    const def: ToolDefinition = {
      name: tool.name,
      description: tool.description || "",
      inputSchema: tool.inputSchema || { type: "object" },
    };
    allTools.push(def);
    ctx.toolCache.set(tool.name, def);
  }

  // Mesh tools
  const connections = await ctx.listConnections();
  for (const conn of connections) {
    for (const tool of conn.tools) {
      const def: ToolDefinition = {
        name: tool.name,
        description: tool.description || "",
        inputSchema: tool.inputSchema || { type: "object" },
      };
      allTools.push(def);
      ctx.toolCache.set(tool.name, def);
    }
  }

  // Add meta tools for "discover" mode
  if (toolsConfig === "discover") {
    allTools.push(
      {
        name: "list_workflows",
        description: "List available workflows",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "start_workflow",
        description: "Start a workflow by ID",
        inputSchema: {
          type: "object",
          properties: {
            workflowId: { type: "string" },
            input: { type: "object" },
          },
          required: ["workflowId"],
        },
      },
    );
  }

  return allTools;
}

async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<unknown> {
  // Meta tools
  if (toolName === "list_workflows") {
    const workflows = await listWorkflows();
    return {
      workflows: workflows.map((w) => ({
        id: w.id,
        title: w.title,
        description: w.description,
      })),
    };
  }

  if (toolName === "start_workflow") {
    const workflowId = args.workflowId as string;
    const workflowInput = (args.input as Record<string, unknown>) || {};
    const result = await runWorkflow(workflowId, workflowInput, {
      config: ctx.config,
      callLLM: ctx.callLLM,
      callMeshTool: ctx.callMeshTool,
      listConnections: ctx.listConnections,
      publishEvent: ctx.publishEvent,
    });
    return result;
  }

  if (toolName === "list_tools") {
    const connections = await ctx.listConnections();
    const localTools = getAllLocalTools();

    return {
      local_tools: localTools.map((t) => ({
        name: t.name,
        description: t.description,
      })),
      connections: connections.map((c) => ({
        id: c.id,
        title: c.title,
        tools: c.tools.map((t) => ({
          name: t.name,
          description: t.description,
        })),
      })),
    };
  }

  if (toolName === "call_tool") {
    const targetTool = args.toolName as string;
    const toolArgs = (args.arguments as Record<string, unknown>) || {};

    // Try local tools first
    const localTools = getAllLocalTools();
    const localTool = localTools.find((t) => t.name === targetTool);
    if (localTool) {
      const result = await localTool.execute(toolArgs);
      if (result.content && Array.isArray(result.content)) {
        const textContent = result.content.find(
          (c: { type: string }) => c.type === "text",
        );
        if (textContent && "text" in textContent) {
          try {
            return JSON.parse(textContent.text as string);
          } catch {
            return textContent.text;
          }
        }
      }
      return result;
    }

    // Try mesh tools
    const connections = await ctx.listConnections();
    for (const conn of connections) {
      const tool = conn.tools.find((t) => t.name === targetTool);
      if (tool) {
        return ctx.callMeshTool(conn.id, targetTool, toolArgs);
      }
    }

    throw new Error(`Tool not found: ${targetTool}`);
  }

  // Local tools
  const localTools = getAllLocalTools();
  const localTool = localTools.find((t) => t.name === toolName);
  if (localTool) {
    const result = await localTool.execute(args);
    if (result.content && Array.isArray(result.content)) {
      const textContent = result.content.find(
        (c: { type: string }) => c.type === "text",
      );
      if (textContent && "text" in textContent) {
        try {
          return JSON.parse(textContent.text as string);
        } catch {
          return textContent.text;
        }
      }
    }
    return result;
  }

  // Mesh tools
  const connections = await ctx.listConnections();
  for (const conn of connections) {
    const tool = conn.tools.find((t) => t.name === toolName);
    if (tool) {
      return ctx.callMeshTool(conn.id, toolName, args);
    }
  }

  throw new Error(`Tool not found: ${toolName}`);
}

// ============================================================================
// Helpers
// ============================================================================

function parseStructuredOutput(text: string): {
  response?: string;
  [key: string]: unknown;
} {
  if (!text) return { response: "(No response)" };

  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const jsonStr = jsonMatch ? jsonMatch[1] : text;

  try {
    const parsed = JSON.parse(jsonStr.trim());
    if (typeof parsed === "object" && parsed !== null) {
      return {
        ...parsed,
        response:
          typeof parsed.response === "string" ? parsed.response : undefined,
      };
    }
  } catch {
    // Not JSON
  }

  return { response: text };
}

function extractResponse(output: unknown): string | undefined {
  if (typeof output === "string") return output;
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    if (typeof o.response === "string") return o.response;
    if (typeof o.text === "string") return o.text;
  }
  return undefined;
}

function evaluateSkipIf(
  condition: string,
  context: { input: Record<string, unknown>; steps: Record<string, unknown> },
): boolean {
  if (condition.startsWith("empty:")) {
    const ref = condition.slice(6);
    const value = resolveRefs(ref, context);
    if (value === undefined || value === null) return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
  }
  return false;
}
