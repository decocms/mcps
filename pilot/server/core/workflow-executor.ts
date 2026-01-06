/**
 * Workflow Executor
 *
 * Executes workflows step-by-step, tracking progress in task files.
 * Each step is logged to the task JSON file for debugging and progress reporting.
 */

console.error("[pilot] workflow-executor.ts LOADED - v2");

import type { Task, StepResult } from "../types/task.ts";
import { createTask } from "../types/task.ts";
import {
  type Workflow,
  type Step,
  resolveRefs,
  groupStepsByLevel,
} from "../types/workflow.ts";
import {
  saveTask,
  loadTask,
  updateTaskStep,
  completeTask,
  failTask,
  addStepProgress,
} from "./task-storage.ts";
import { loadWorkflow } from "./workflow-storage.ts";
import { getAllLocalTools } from "../tools/index.ts";

// ============================================================================
// Workflow Tool Validation
// ============================================================================

/**
 * Extract all required tool names from a workflow.
 * Returns tools explicitly referenced in steps (not "all" or "discover").
 */
function extractRequiredTools(workflow: Workflow): string[] {
  const tools = new Set<string>();

  for (const step of workflow.steps) {
    // Tool call action - requires specific tool
    if (step.action.type === "tool") {
      tools.add(step.action.toolName);
    }

    // LLM action with explicit tool list
    if (step.action.type === "llm" && Array.isArray(step.action.tools)) {
      for (const toolName of step.action.tools) {
        tools.add(toolName);
      }
    }
  }

  return Array.from(tools).sort();
}

/**
 * Validation result for workflow tools
 */
export interface ToolValidationResult {
  valid: boolean;
  requiredTools: string[];
  availableTools: string[];
  missingTools: string[];
}

/**
 * Validate that all required tools for a workflow are available.
 * Returns validation result with missing tools if any.
 */
export async function validateWorkflowTools(
  workflow: Workflow,
  listConnections: ListConnectionsCallback,
): Promise<ToolValidationResult> {
  const requiredTools = extractRequiredTools(workflow);

  // Get all available tools from connections
  const connections = await listConnections();
  const availableTools = new Set<string>();
  for (const conn of connections) {
    for (const tool of conn.tools) {
      availableTools.add(tool.name);
    }
  }

  // Also include Pilot's local tools (LIST_FILES, READ_FILE, EXECUTE, etc.)
  for (const tool of getAllLocalTools()) {
    availableTools.add(tool.name);
  }

  // Find missing tools
  const missingTools = requiredTools.filter((t) => !availableTools.has(t));

  return {
    valid: missingTools.length === 0,
    requiredTools,
    availableTools: Array.from(availableTools).sort(),
    missingTools,
  };
}

// ============================================================================
// Types
// ============================================================================

/** Tool definition with full schema */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface ExecutionContext {
  /** Current task being executed */
  task: Task;
  /** Workflow being executed */
  workflow: Workflow;
  /** Step outputs keyed by step name */
  stepOutputs: Record<string, unknown>;
  /** Workflow input */
  workflowInput: Record<string, unknown>;
  /** Progress callback - sent to event bus AND saved to task JSON */
  onProgress?: (taskId: string, stepName: string, message: string) => void;
  /** Log to task only - saved to task JSON but NOT sent to event bus (for verbose tool results) */
  logToTask?: (taskId: string, stepName: string, message: string) => void;
  /** Mode change callback */
  onModeChange?: (mode: "FAST" | "SMART") => void;
  /** Tool execution callbacks */
  callLLM: LLMCallback;
  callMeshTool: MeshToolCallback;
  listConnections: ListConnectionsCallback;
  /** Tool cache - populated by first step, reused by subsequent steps */
  toolCache?: Map<string, ToolDefinition>;
  /** Event publishing callback - for async task completion notifications */
  publishEvent?: (
    eventType: string,
    data: Record<string, unknown>,
  ) => Promise<void>;
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
  onProgress?: (taskId: string, stepName: string, message: string) => void;
  onModeChange?: (mode: "FAST" | "SMART") => void;
}

// ============================================================================
// Output Parsing
// ============================================================================

interface StructuredLLMOutput {
  response?: string;
  taskForSmartAgent?: string;
  toolsForSmartAgent?: string[];
  context?: unknown;
  // Full parsed JSON for schema validation
  [key: string]: unknown;
}

/**
 * Parse structured output from LLM response
 * The LLM may return JSON or plain text, possibly wrapped in markdown code blocks
 */
function parseStructuredOutput(text: string): StructuredLLMOutput {
  if (!text) {
    console.warn("[pilot] parseStructuredOutput: empty text received");
    return { response: "(No response)" };
  }

  // Try to extract JSON from markdown code block first (```json or just ```)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const jsonStr = jsonMatch ? jsonMatch[1] : text;

  try {
    const parsed = JSON.parse(jsonStr.trim());

    // Validate it's an object
    if (typeof parsed !== "object" || parsed === null) {
      return { response: text };
    }

    // Spread all parsed fields, then add known fields with fallbacks
    return {
      ...parsed,
      response:
        typeof parsed.response === "string" ? parsed.response : undefined,
      taskForSmartAgent:
        typeof parsed.taskForSmartAgent === "string"
          ? parsed.taskForSmartAgent
          : typeof parsed.task === "string"
            ? parsed.task
            : undefined,
      toolsForSmartAgent: Array.isArray(parsed.toolsForSmartAgent)
        ? parsed.toolsForSmartAgent
        : Array.isArray(parsed.tools)
          ? parsed.tools
          : undefined,
      context: parsed.context,
    };
  } catch {
    // JSON parsing failed - try to extract response from partial/malformed JSON
    // Look for "response": "..." pattern
    const responseMatch = text.match(/"response"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (responseMatch) {
      try {
        // Unescape the JSON string
        const unescaped = JSON.parse(`"${responseMatch[1]}"`);
        return { response: unescaped };
      } catch {
        // Return the raw match if unescaping fails
        return { response: responseMatch[1] };
      }
    }

    // Not JSON at all, return as plain response
    return { response: text };
  }
}

/**
 * Validate step output against schema
 * Checks that required fields exist and have correct types
 */
function validateOutputSchema(
  output: unknown,
  schema: Record<string, unknown>,
  stepName: string,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  console.error(
    `[pilot] validateOutputSchema for "${stepName}":`,
    JSON.stringify(output, null, 2)?.slice(0, 500),
  );

  if (!schema || typeof schema !== "object") {
    return { valid: true, errors: [] };
  }

  const outputObj = output as Record<string, unknown> | undefined;
  if (!outputObj || typeof outputObj !== "object") {
    errors.push(`Step "${stepName}" output is not an object`);
    return { valid: false, errors };
  }

  // Check required fields
  const requiredFields = (schema.required as string[]) || [];
  for (const field of requiredFields) {
    if (!(field in outputObj) || outputObj[field] === undefined) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Check field types if "properties" is defined
  const properties =
    (schema.properties as Record<string, { type?: string }>) || {};
  for (const [field, fieldSchema] of Object.entries(properties)) {
    if (field in outputObj && fieldSchema.type) {
      const value = outputObj[field];
      const expectedType = fieldSchema.type;
      const actualType = Array.isArray(value) ? "array" : typeof value;

      if (expectedType === "array" && !Array.isArray(value)) {
        errors.push(`Field "${field}" should be array, got ${actualType}`);
      } else if (expectedType !== "array" && actualType !== expectedType) {
        errors.push(
          `Field "${field}" should be ${expectedType}, got ${actualType}`,
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Step Executors
// ============================================================================

/**
 * Execute a tool step
 */
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

  ctx.onProgress?.(ctx.task.taskId, step.name, `⚡ Calling ${toolName}...`);

  const result = await ctx.callMeshTool(connId, toolName, resolvedInput);

  ctx.onProgress?.(ctx.task.taskId, step.name, `✓ ${toolName} completed`);

  return result;
}

/**
 * Execute a code step (data transformation)
 */
async function executeCodeStep(
  step: Step,
  resolvedInput: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<unknown> {
  if (step.action.type !== "code") throw new Error("Not a code step");

  ctx.onProgress?.(ctx.task.taskId, step.name, `📝 Running transformation...`);

  // Simple eval for now - in production would use QuickJS sandbox
  // The code should export a default function
  const code = step.action.code;

  try {
    // Create a function from the code
    const fn = new Function(
      "input",
      `
      const exports = {};
      ${code.replace(/export\s+default\s+/g, "exports.default = ")}
      return exports.default(input);
    `,
    );

    const result = fn(resolvedInput);
    ctx.onProgress?.(ctx.task.taskId, step.name, `✓ Transformation completed`);
    return result;
  } catch (error) {
    throw new Error(
      `Code execution failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Execute a template step (simple string interpolation)
 * Resolves @references in the template string
 */
function executeTemplateStep(step: Step, ctx: ExecutionContext): unknown {
  if (step.action.type !== "template") throw new Error("Not a template step");

  const template = step.action.template;
  if (!template) {
    throw new Error("Template step requires a 'template' field");
  }

  ctx.onProgress?.(ctx.task.taskId, step.name, `📝 Formatting response...`);

  // Resolve the template by replacing @references
  const result = resolveRefs(
    { response: template },
    {
      input: ctx.workflowInput,
      steps: ctx.stepOutputs,
    },
  ) as { response: string };

  return { response: result.response };
}

/**
 * Execute an LLM step (agent loop)
 */
async function executeLLMStep(
  step: Step,
  resolvedInput: Record<string, unknown>,
  ctx: ExecutionContext,
  config: ExecutorConfig,
): Promise<{
  response?: string;
  taskForSmartAgent?: string;
  toolsForSmartAgent?: string[];
  context?: string;
}> {
  if (step.action.type !== "llm") throw new Error("Not an LLM step");

  const {
    prompt,
    model,
    systemPrompt,
    tools,
    maxIterations = 10,
  } = step.action;

  // Determine model ID
  const modelId = model === "fast" ? config.fastModel : config.smartModel;
  ctx.onModeChange?.(model === "fast" ? "FAST" : "SMART");

  // Use ⚡ for FAST (quick), 🧠 for SMART (thinking hard)
  const modelEmoji = model === "fast" ? "⚡" : "🧠";
  await ctx.onProgress?.(
    ctx.task.taskId,
    step.name,
    `${modelEmoji} ${model.toUpperCase()}: Thinking...`,
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
    messages.push(...history.slice(-4));
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

  // Resolve tools config if it's a reference (e.g., "@fast_discovery.toolsForSmartAgent")
  let resolvedToolsConfig: "all" | "discover" | "none" | string[] | undefined =
    tools;
  if (typeof tools === "string" && tools.startsWith("@")) {
    const resolved = resolveRefs(tools, {
      input: ctx.workflowInput,
      steps: ctx.stepOutputs,
    });
    if (Array.isArray(resolved)) {
      resolvedToolsConfig = resolved as string[];
      console.error(
        `[pilot] [${step.name}] Resolved tools reference: ${tools} → ${resolved.length} tools`,
      );
    } else {
      console.warn(
        `[pilot] [${step.name}] Tools reference ${tools} resolved to non-array:`,
        resolved,
      );
      resolvedToolsConfig = undefined;
    }
  }

  // Gather tools based on configuration
  const toolDefs = await gatherTools(resolvedToolsConfig, resolvedInput, ctx);

  // Log discovered tools for debugging
  const toolNames = toolDefs.map((t) => t.name);
  console.error(
    `[pilot] [${step.name}] Discovered ${toolDefs.length} tools: ${toolNames.slice(0, 20).join(", ")}${toolDefs.length > 20 ? "..." : ""}`,
  );

  ctx.onProgress?.(
    ctx.task.taskId,
    step.name,
    `🧠 ${model.toUpperCase()}: ${toolDefs.length} tools available`,
  );

  // Run the LLM loop
  const usedTools: string[] = [];

  for (let i = 0; i < maxIterations; i++) {
    const result = await ctx.callLLM(modelId, messages, toolDefs);

    // No tool calls = final response
    if (!result.toolCalls || result.toolCalls.length === 0) {
      console.error(
        `[pilot] [${step.name}] LLM final response: ${result.text?.slice(0, 200)}...`,
      );

      // Note: No "Done" message - "workflow completed" is sufficient

      // Try to parse structured output from the LLM
      const parsed = parseStructuredOutput(result.text || "");

      // Ensure we always have a response
      const finalResponse =
        parsed.response || result.text || "(Task completed)";

      // Return ALL parsed fields (for schema validation) plus standard fields
      return {
        ...parsed, // Include all JSON fields for schema validation
        response: finalResponse,
        taskForSmartAgent: parsed.taskForSmartAgent,
        toolsForSmartAgent: parsed.toolsForSmartAgent,
        context: parsed.context ? JSON.stringify(parsed.context) : undefined,
      };
    }

    // Process tool calls
    for (const tc of result.toolCalls) {
      usedTools.push(tc.name);

      ctx.onProgress?.(
        ctx.task.taskId,
        step.name,
        `🔧 ${model.toUpperCase()}: ${tc.name}...`,
      );

      try {
        // Find and execute the tool
        const toolResult = await executeToolCall(
          tc.name,
          tc.arguments,
          ctx,
          config,
        );
        const resultStr = JSON.stringify(toolResult, null, 2);
        const resultPreview = resultStr.slice(0, 500);

        // Log tool result for debugging
        console.error(
          `[pilot] Tool ${tc.name} result (${resultStr.length} chars): ${resultPreview}`,
        );

        // Check if result is actually an error (structured error response, not just containing the word "error")
        const isErrorResult =
          (typeof toolResult === "object" &&
            toolResult !== null &&
            ("error" in toolResult || "isError" in toolResult)) ||
          resultStr.startsWith('{"error":') ||
          resultStr.startsWith('{"isError":true');

        if (isErrorResult) {
          ctx.onProgress?.(
            ctx.task.taskId,
            step.name,
            `❌ ${tc.name} error: ${resultPreview.slice(0, 200)}`,
          );
        } else {
          // Short status to WhatsApp (via onProgress)
          ctx.onProgress?.(
            ctx.task.taskId,
            step.name,
            `✓ ${tc.name} completed`,
          );

          // Full result to task JSON only (via logToTask) - not sent to WhatsApp
          const taskLogPreview = resultStr.slice(0, 4000);
          ctx.logToTask?.(
            ctx.task.taskId,
            step.name,
            `📋 ${tc.name} result:\n${taskLogPreview}${resultStr.length > 4000 ? "\n... (truncated)" : ""}`,
          );
        }

        // Add to messages
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

        // Log tool error to task progress
        ctx.onProgress?.(
          ctx.task.taskId,
          step.name,
          `❌ ${tc.name} threw: ${errorMsg}`,
        );

        messages.push({
          role: "user",
          content: `[Tool Error for ${tc.name}]: ${errorMsg}`,
        });
      }
    }
  }

  ctx.onProgress?.(
    ctx.task.taskId,
    step.name,
    `⚠️ ${model.toUpperCase()}: Reached iteration limit, summarizing...`,
  );

  // Instead of giving up, ask LLM to summarize what it found (no tools)
  messages.push({
    role: "user",
    content:
      "You've reached the iteration limit. Please provide a summary response based on the information you've gathered so far. Do NOT call any more tools - just summarize your findings.",
  });

  try {
    const summaryResult = await ctx.callLLM(modelId, messages, []); // No tools
    if (summaryResult.text) {
      console.error(
        `[pilot] [${step.name}] Summary after limit: ${summaryResult.text.slice(0, 200)}...`,
      );
      return {
        response: summaryResult.text,
      };
    }
  } catch (e) {
    console.error(`[pilot] [${step.name}] Failed to get summary:`, e);
  }

  // Fallback: extract any useful content from message history
  const toolResults = messages
    .filter((m) => m.content.startsWith("[Tool Result"))
    .map((m) => m.content)
    .join("\n\n");

  if (toolResults) {
    return {
      response: `Research completed (partial results):\n\n${toolResults.slice(0, 3000)}`,
    };
  }

  return {
    response: "Reached iteration limit. Some results may be incomplete.",
  };
}

/**
 * Gather tools based on step configuration
 * Uses a cache to share full tool definitions between FAST and SMART steps
 */
async function gatherTools(
  toolsConfig: "all" | "discover" | "none" | string[] | undefined,
  resolvedInput: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<Array<{ name: string; description: string; inputSchema: unknown }>> {
  if (toolsConfig === "none" || !toolsConfig) {
    return [];
  }

  // Initialize cache if not exists
  if (!ctx.toolCache) {
    ctx.toolCache = new Map();
  }

  // If specific tools are provided (from previous step), look up from cache
  if (Array.isArray(toolsConfig)) {
    const tools: ToolDefinition[] = [];

    for (const name of toolsConfig) {
      const cached = ctx.toolCache.get(name);
      if (cached) {
        tools.push(cached);
        console.error(`[pilot] Tool ${name}: found in cache with schema`);
      } else {
        // First check local tools
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
          console.error(`[pilot] Tool ${name}: found in local tools`);
          continue;
        }

        // Fallback: try to find in connections
        console.error(`[pilot] Tool ${name}: not in cache, fetching...`);
        const connections = await ctx.listConnections();
        let found = false;
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
            found = true;
            break;
          }
        }
        if (!found) {
          console.warn(`[pilot] Tool ${name}: NOT FOUND - using stub`);
          tools.push({
            name,
            description: `Tool "${name}" - schema not found`,
            inputSchema: { type: "object" },
          });
        }
      }
    }

    return tools;
  }

  // For "all" or "discover", get all available tools and cache them
  const connections = await ctx.listConnections();
  const allTools: ToolDefinition[] = [];

  // Add local tools first (LIST_FILES, READ_FILE, etc.)
  const localTools = getAllLocalTools();
  for (const tool of localTools) {
    const def: ToolDefinition = {
      name: tool.name,
      description: tool.description || "",
      inputSchema: tool.inputSchema || { type: "object" },
    };
    allTools.push(def);
    ctx.toolCache.set(tool.name, def);
  }

  // Debug: log all connections and their tool counts
  console.error(
    `[pilot] Connections: ${connections.map((c) => `${c.title}(${c.tools.length})`).join(", ")}`,
  );

  for (const conn of connections) {
    for (const tool of conn.tools) {
      const def: ToolDefinition = {
        name: tool.name,
        description: tool.description || "",
        inputSchema: tool.inputSchema || { type: "object" },
      };
      allTools.push(def);
      // Cache for later use by SMART step
      ctx.toolCache.set(tool.name, def);
    }
  }

  // Add router tools for "discover" mode
  if (toolsConfig === "discover") {
    allTools.push(
      {
        name: "list_local_tools",
        description: "List available local system tools",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "list_mesh_tools",
        description: "List available MCP mesh tools",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "explore_files",
        description: "List files in a directory",
        inputSchema: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
      {
        name: "peek_file",
        description: "Read a file (first 200 lines)",
        inputSchema: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
      {
        name: "execute_task",
        description: "Execute a task with a plan and tools",
        inputSchema: {
          type: "object",
          properties: {
            task: { type: "string" },
            tools: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  source: { type: "string" },
                  connectionId: { type: "string" },
                },
              },
            },
          },
          required: ["task", "tools"],
        },
      },
      {
        name: "list_workflows",
        description:
          "List available workflows that can be executed. Workflows are pre-defined multi-step procedures.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "execute_workflow",
        description:
          "Execute a workflow by ID. Use list_workflows to see available workflows. The workflow steps will run in sequence.",
        inputSchema: {
          type: "object",
          properties: {
            workflowId: {
              type: "string",
              description: "The ID of the workflow to execute",
            },
            input: {
              type: "object",
              description:
                "Input parameters for the workflow (varies by workflow)",
            },
          },
          required: ["workflowId"],
        },
      },
      // Task management tools (for router)
      {
        name: "start_task",
        description:
          "Start a workflow as a new background task. IMPORTANT: You MUST provide workflowId! Call list_workflows() first to see available workflow IDs. Example: start_task({ workflowId: 'create-article-research', input: { topic: 'AI' } })",
        inputSchema: {
          type: "object",
          properties: {
            workflowId: {
              type: "string",
              description:
                "REQUIRED. The ID of the workflow to run (e.g., 'create-article-research'). Get this from list_workflows().",
            },
            input: {
              type: "object",
              description:
                "Input parameters for the workflow (e.g., { topic: 'AI agents', message: 'original user message' })",
            },
          },
          required: ["workflowId"],
        },
      },
      {
        name: "check_task",
        description:
          "Check the status and progress of a task. Returns current step, progress, and result if completed.",
        inputSchema: {
          type: "object",
          properties: {
            taskId: {
              type: "string",
              description: "The task ID to check",
            },
          },
          required: ["taskId"],
        },
      },
      {
        name: "list_tasks",
        description:
          "List all tasks. Optionally filter by status (working, completed, failed).",
        inputSchema: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["working", "completed", "failed", "cancelled"],
              description: "Filter by status",
            },
            limit: {
              type: "number",
              description: "Maximum number of tasks to return (default 10)",
            },
          },
        },
      },
      {
        name: "delete_task",
        description: "Delete a task from history.",
        inputSchema: {
          type: "object",
          properties: {
            taskId: {
              type: "string",
              description: "The task ID to delete",
            },
          },
          required: ["taskId"],
        },
      },
      {
        name: "NEW_THREAD",
        description:
          "Close the current conversation thread. Next message will start fresh. Use when user says 'new thread', 'nova conversa', 'start over', etc.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    );
  }

  return allTools;
}

/**
 * Execute a single tool call
 */
async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ExecutionContext,
  config: ExecutorConfig,
): Promise<unknown> {
  // Check if it's a built-in router tool
  switch (toolName) {
    case "list_local_tools":
      ctx.onProgress?.(
        ctx.task.taskId,
        "_discovery",
        "🔧 Listing local tools...",
      );
      return {
        tools: ["READ_FILE", "WRITE_FILE", "LIST_FILES", "SHELL", "SPEAK"],
        count: 5,
      };

    case "list_mesh_tools": {
      ctx.onProgress?.(
        ctx.task.taskId,
        "_discovery",
        "🔍 Discovering mesh tools...",
      );
      const connections = await ctx.listConnections();
      const allTools = connections.flatMap((c) =>
        c.tools.map((t) => ({
          name: t.name,
          description: (t.description || "").slice(0, 150),
          connectionId: c.id,
          connectionName: c.title,
        })),
      );
      ctx.onProgress?.(
        ctx.task.taskId,
        "_discovery",
        `Found ${allTools.length} tools from ${connections.length} connections`,
      );
      return { allTools, totalToolCount: allTools.length };
    }

    case "execute_task": {
      // This is the handoff from FAST to SMART
      return {
        task: args.task as string,
        tools:
          (args.tools as Array<{ name: string }>)?.map((t) => t.name) || [],
        context: args.context as string,
      };
    }

    case "list_workflows": {
      ctx.onProgress?.(
        ctx.task.taskId,
        "_discovery",
        "📋 Listing workflows...",
      );
      const { listWorkflows } = await import("./workflow-storage.ts");
      const workflows = listWorkflows();
      ctx.onProgress?.(
        ctx.task.taskId,
        "_discovery",
        `Found ${workflows.length} workflows`,
      );
      return {
        workflows: workflows.map((w) => ({
          id: w.id,
          title: w.title,
          description: w.description,
          stepCount: w.steps.length,
          steps: w.steps.map((s) => s.name),
        })),
        count: workflows.length,
      };
    }

    case "execute_workflow": {
      const workflowId = args.workflowId as string | undefined;
      const workflowInput = (args.input as Record<string, unknown>) || {};

      // Validate workflowId is provided and not empty
      if (
        !workflowId ||
        workflowId === "undefined" ||
        workflowId.trim() === ""
      ) {
        ctx.onProgress?.(
          ctx.task.taskId,
          "_workflow",
          `❌ Invalid workflow ID: "${workflowId}". Use list_workflows() to see available workflows.`,
        );
        throw new Error(
          `Invalid workflow ID: "${workflowId}". Please provide a valid workflow ID. Use list_workflows() to see available workflows.`,
        );
      }

      // Note: executeWorkflow will log its own "Start:" message
      const { loadWorkflow } = await import("./workflow-storage.ts");
      const workflow = loadWorkflow(workflowId);

      if (!workflow) {
        ctx.onProgress?.(
          ctx.task.taskId,
          "_workflow",
          `❌ Workflow not found: ${workflowId}`,
        );
        throw new Error(`Workflow not found: ${workflowId}`);
      }

      ctx.onProgress?.(
        ctx.task.taskId,
        "_workflow",
        `📋 Run: ${workflow.title} (${workflow.steps.length} steps)`,
      );

      // Execute the workflow inline - steps will be recorded in this task
      const result = await executeWorkflowSteps(workflow, workflowInput, ctx);

      ctx.onProgress?.(
        ctx.task.taskId,
        "_workflow",
        `✅ Done: ${workflow.title}`,
      );

      return result;
    }

    // ========================================================================
    // Task Management Tools (for router)
    // ========================================================================

    case "start_task": {
      // Handle various argument formats LLMs might use
      let workflowId: string | undefined;
      if (typeof args.workflowId === "string" && args.workflowId.trim()) {
        workflowId = args.workflowId.trim();
      } else if (
        typeof args.workflow_id === "string" &&
        args.workflow_id.trim()
      ) {
        workflowId = args.workflow_id.trim();
      } else if (typeof args.workflow === "string" && args.workflow.trim()) {
        workflowId = args.workflow.trim();
      } else if (typeof args.id === "string" && args.id.trim()) {
        workflowId = args.id.trim();
      } else if (typeof args.name === "string" && args.name.trim()) {
        workflowId = args.name.trim();
      }

      // Also try to extract from nested objects
      if (
        !workflowId &&
        typeof args.input === "object" &&
        args.input !== null
      ) {
        const input = args.input as Record<string, unknown>;
        if (typeof input.workflowId === "string") {
          workflowId = input.workflowId;
        } else if (typeof input.workflow_id === "string") {
          workflowId = input.workflow_id;
        }
      }

      const workflowInput = (args.input as Record<string, unknown>) || {};

      if (!workflowId) {
        // Log what we actually received for debugging
        console.error(
          `[pilot] start_task called with args: ${JSON.stringify(args)}`,
        );
        throw new Error(
          `workflowId is required. Call list_workflows() first to see available IDs, then call start_task({ workflowId: "the-id", input: { ... } })`,
        );
      }

      const { loadWorkflow } = await import("./workflow-storage.ts");
      const workflow = loadWorkflow(workflowId);

      if (!workflow) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }

      ctx.onProgress?.(
        ctx.task.taskId,
        "_task",
        `🚀 Starting task: ${workflow.title}`,
      );

      // Create a new task for this workflow
      const taskInput = {
        ...workflowInput,
        message: workflowInput.message || ctx.workflowInput?.message,
      };
      const newTask = createTask(
        workflowId,
        taskInput,
        ctx.task.source || "api",
        { chatId: ctx.task.chatId },
      );
      saveTask(newTask);

      // Execute the workflow asynchronously (fire and forget)
      // Use setTimeout to ensure we return BEFORE the workflow starts
      // Pass the task we created so executeWorkflow uses it instead of creating a new one
      // When complete, it publishes an event so the bridge can notify the user
      setTimeout(async () => {
        console.error(
          `[pilot] [start_task] Async execution starting for ${workflowId} (task: ${newTask.taskId})`,
        );
        try {
          const result = await executeWorkflow(workflowId, taskInput, {
            source: ctx.task.source || "api",
            chatId: ctx.task.chatId,
            config: {
              // Pass through the actual model IDs from parent config
              fastModel: config.fastModel,
              smartModel: config.smartModel,
              onProgress: ctx.onProgress,
              onModeChange: ctx.onModeChange,
            },
            callLLM: ctx.callLLM,
            callMeshTool: ctx.callMeshTool,
            listConnections: ctx.listConnections,
            publishEvent: ctx.publishEvent,
            existingTask: newTask, // Use the task we already created
          });

          console.error(
            `[pilot] [start_task] Workflow ${workflowId} completed, result:`,
            JSON.stringify(result?.result)?.slice(0, 200),
          );

          // Publish completion events so bridge can notify user
          if (ctx.publishEvent) {
            // Extract the response from the result
            const taskResult = result?.result as
              | Record<string, unknown>
              | undefined;
            const responseText =
              taskResult?.response ||
              (typeof taskResult === "string"
                ? taskResult
                : JSON.stringify(taskResult));

            const source = ctx.task.source || "api";

            console.error(
              `[pilot] [start_task] Publishing completion events for ${newTask.taskId} (source: ${source})`,
            );

            // Publish response event (same pattern as synchronous workflows)
            await ctx.publishEvent(`agent.response.${source}`, {
              taskId: newTask.taskId,
              source,
              chatId: ctx.task.chatId,
              text: responseText,
              isFinal: true,
            });

            // Also publish task.completed for monitoring
            await ctx.publishEvent("agent.task.completed", {
              taskId: newTask.taskId,
              workflowId,
              workflowTitle: workflow.title,
              source,
              chatId: ctx.task.chatId,
              status: "completed",
              response: responseText,
            });
          }
        } catch (err) {
          console.error(`[pilot] Task ${newTask.taskId} failed:`, err);

          // Publish failure events
          if (ctx.publishEvent) {
            const source = ctx.task.source || "api";
            const errorMsg = err instanceof Error ? err.message : String(err);

            // Publish error response
            await ctx.publishEvent(`agent.response.${source}`, {
              taskId: newTask.taskId,
              source,
              chatId: ctx.task.chatId,
              text: `❌ Task failed: ${errorMsg}`,
              isFinal: true,
            });

            // Also publish task.completed for monitoring
            await ctx.publishEvent("agent.task.completed", {
              taskId: newTask.taskId,
              workflowId,
              workflowTitle: workflow.title,
              source,
              chatId: ctx.task.chatId,
              status: "failed",
              error: errorMsg,
            });
          }
        }
      }, 10); // Small delay to ensure start_task returns first

      return {
        taskId: newTask.taskId,
        workflow: workflowId,
        title: workflow.title,
        status: "started",
        message: `Started task ${newTask.taskId}. Ask me for status anytime.`,
      };
    }

    case "check_task": {
      const taskId = args.taskId as string;
      if (!taskId) throw new Error("taskId is required");

      const { loadTask } = await import("./task-storage.ts");
      const task = loadTask(taskId);

      if (!task) {
        return { error: `Task not found: ${taskId}` };
      }

      const currentStep = task.stepResults[task.currentStepIndex];
      const lastProgress = currentStep?.progressMessages?.slice(-1)[0]?.message;

      return {
        taskId: task.taskId,
        workflow: task.workflowId,
        status: task.status,
        currentStep: currentStep?.stepName,
        stepProgress: `${task.currentStepIndex + 1}/${task.stepResults.length || "?"}`,
        lastProgress,
        result: task.status === "completed" ? task.result : undefined,
        error: task.status === "failed" ? task.error : undefined,
        createdAt: task.createdAt,
      };
    }

    case "list_tasks": {
      const { listTasks } = await import("./task-storage.ts");
      const status = args.status as string | undefined;
      const limit = (args.limit as number) || 10;

      const { tasks } = listTasks({
        status: status as any,
        limit,
      });

      return {
        tasks: tasks.map((t) => {
          // Extract topic/input for context
          const input = t.workflowInput || {};
          const topic =
            input.topic || input.message || input.theme || "(no topic)";

          // Get result summary if completed
          const resultSummary =
            t.status === "completed" && t.result
              ? typeof t.result === "string"
                ? t.result.slice(0, 200)
                : JSON.stringify(t.result).slice(0, 200)
              : undefined;

          return {
            id: t.taskId,
            workflow: t.workflowId,
            status: t.status,
            topic: typeof topic === "string" ? topic.slice(0, 100) : topic,
            currentStep: t.stepResults[t.currentStepIndex]?.stepName,
            createdAt: t.createdAt,
            lastUpdatedAt: t.lastUpdatedAt,
            resultPreview: resultSummary,
          };
        }),
        count: tasks.length,
        hint: "Use this context to understand what the user is referring to when they say 'draft this', 'continue', etc.",
      };
    }

    case "delete_task": {
      const taskId = args.taskId as string;
      if (!taskId) throw new Error("taskId is required");

      const { deleteTask } = await import("./task-storage.ts");
      const deleted = deleteTask(taskId);

      return {
        deleted,
        taskId,
        message: deleted
          ? `Task ${taskId} deleted.`
          : `Task ${taskId} not found.`,
      };
    }

    case "NEW_THREAD": {
      const { closeThread } = await import("./task-storage.ts");
      const source = (args.source as string) || ctx.task.source;
      const chatId = (args.chatId as string) || ctx.task.chatId;

      const closedTask = closeThread(source, chatId);

      if (!closedTask) {
        return {
          success: true,
          hadActiveThread: false,
          message: "No active thread to close. Next message will start fresh.",
        };
      }

      return {
        success: true,
        hadActiveThread: true,
        closedTaskId: closedTask.taskId,
        message: "Thread closed. Next message will start a new conversation.",
      };
    }

    // ========================================================================
    // Local Tools (LIST_FILES, READ_FILE, WRITE_FILE, EXECUTE, SPEAK)
    // ========================================================================

    case "LIST_FILES":
    case "READ_FILE":
    case "WRITE_FILE":
    case "EXECUTE":
    case "SPEAK": {
      // Import and execute local tool
      const { getAllLocalTools } = await import("../tools/index.ts");
      const localTools = getAllLocalTools();
      const localTool = localTools.find((t) => t.name === toolName);
      if (localTool) {
        const result = await localTool.execute(args);
        // Extract text content from MCP result format
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
      throw new Error(`Local tool not found: ${toolName}`);
    }

    default: {
      // Find the tool in mesh connections
      const connections = await ctx.listConnections();
      for (const conn of connections) {
        const tool = conn.tools.find((t) => t.name === toolName);
        if (tool) {
          return ctx.callMeshTool(conn.id, toolName, args);
        }
      }
      throw new Error(`Tool not found: ${toolName}`);
    }
  }
}

// ============================================================================
// Inline Workflow Execution (for execute_workflow tool)
// ============================================================================

/**
 * Execute a workflow's steps inline within an existing context
 * Used when an LLM calls execute_workflow tool
 */
async function executeWorkflowSteps(
  workflow: Workflow,
  workflowInput: Record<string, unknown>,
  parentCtx: ExecutionContext,
): Promise<unknown> {
  // Create a sub-context that shares the parent's callbacks but has its own step outputs
  const ctx: ExecutionContext = {
    ...parentCtx,
    workflow,
    workflowInput: { ...parentCtx.workflowInput, ...workflowInput },
    stepOutputs: {}, // Fresh step outputs for this workflow
  };

  // Execute steps in order
  const stepLevels = groupStepsByLevel(workflow.steps);

  for (const levelSteps of stepLevels) {
    for (const step of levelSteps) {
      // Report progress for each step
      parentCtx.onProgress?.(
        parentCtx.task.taskId,
        `${workflow.id}:${step.name}`,
        `▶️ ${step.description || step.name}`,
      );

      try {
        const { output, skipped } = await executeStep(step, ctx, {
          fastModel: "fast",
          smartModel: "smart",
          onProgress: parentCtx.onProgress
            ? (taskId, stepName, message) => {
                // Prefix the step name with workflow id for clarity
                parentCtx.onProgress!(
                  taskId,
                  `${workflow.id}:${stepName}`,
                  message,
                );
              }
            : undefined,
          onModeChange: parentCtx.onModeChange,
        });

        if (!skipped) {
          ctx.stepOutputs[step.name] = output;
        }

        parentCtx.onProgress?.(
          parentCtx.task.taskId,
          `${workflow.id}:${step.name}`,
          skipped ? "⏭️ Skipped" : "✅ Done",
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        parentCtx.onProgress?.(
          parentCtx.task.taskId,
          `${workflow.id}:${step.name}`,
          `❌ ${errorMsg}`,
        );

        if (!step.config?.continueOnError) {
          throw error;
        }
      }
    }
  }

  // Return the last step's output
  let finalOutput: unknown = null;
  for (let i = workflow.steps.length - 1; i >= 0; i--) {
    const stepOutput = ctx.stepOutputs[workflow.steps[i].name];
    if (stepOutput !== undefined) {
      finalOutput = stepOutput;
      break;
    }
  }

  return finalOutput;
}

// ============================================================================
// Skip Condition Evaluation
// ============================================================================

/**
 * Evaluate a skipIf condition
 * Supports:
 * - "empty:@stepName.field" - skip if field is empty array or undefined
 * - "equals:@stepName.a,@stepName.b" - skip if a equals b
 */
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

  if (condition.startsWith("equals:")) {
    const parts = condition.slice(7).split(",");
    if (parts.length !== 2) return false;
    const a = resolveRefs(parts[0].trim(), context);
    const b = resolveRefs(parts[1].trim(), context);
    // Deep equality for objects/arrays, simple for primitives
    return JSON.stringify(a) === JSON.stringify(b);
  }

  return false;
}

// ============================================================================
// Main Executor
// ============================================================================

/**
 * Execute a single step (or skip if condition met)
 */
async function executeStep(
  step: Step,
  ctx: ExecutionContext,
  config: ExecutorConfig,
): Promise<{ output: unknown; skipped: boolean }> {
  // Check skipIf condition before executing
  if (step.config?.skipIf) {
    const shouldSkip = evaluateSkipIf(step.config.skipIf, {
      input: ctx.workflowInput,
      steps: ctx.stepOutputs,
    });

    if (shouldSkip) {
      ctx.onProgress?.(
        ctx.task.taskId,
        step.name,
        `⏭️ Skipped (${step.config.skipIf})`,
      );
      return { output: null, skipped: true };
    }
  }

  // Resolve input references
  const resolvedInput = resolveRefs(step.input || {}, {
    input: ctx.workflowInput,
    steps: ctx.stepOutputs,
  }) as Record<string, unknown>;

  let output: unknown;
  switch (step.action.type) {
    case "tool":
      output = await executeToolStep(step, resolvedInput, ctx);
      break;
    case "code":
      output = await executeCodeStep(step, resolvedInput, ctx);
      break;
    case "llm":
      output = await executeLLMStep(step, resolvedInput, ctx, config);
      break;
    case "template":
      output = executeTemplateStep(step, ctx);
      break;
    default:
      throw new Error(
        `Unknown step type: ${(step.action as { type: string }).type}`,
      );
  }

  return { output, skipped: false };
}

/**
 * Execute a workflow
 */
export async function executeWorkflow(
  workflowId: string,
  workflowInput: Record<string, unknown>,
  options: {
    source: string;
    chatId?: string;
    config: ExecutorConfig;
    callLLM: LLMCallback;
    callMeshTool: MeshToolCallback;
    listConnections: ListConnectionsCallback;
    publishEvent?: (
      eventType: string,
      data: Record<string, unknown>,
    ) => Promise<void>;
    /** If provided, use this task instead of creating a new one (for start_task) */
    existingTask?: Task;
  },
): Promise<{ task: Task; result: unknown }> {
  // Load workflow
  const workflow = loadWorkflow(workflowId);
  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  // Validate all required tools are available before starting
  const validation = await validateWorkflowTools(
    workflow,
    options.listConnections,
  );

  if (!validation.valid) {
    const missingList = validation.missingTools
      .map((t) => `  - ${t}`)
      .join("\n");
    throw new Error(
      `Workflow "${workflow.title}" requires tools that are not available:\n\n` +
        `Missing tools:\n${missingList}\n\n` +
        `Make sure the required MCP connections are configured in Mesh.`,
    );
  }

  // Use existing task if provided, otherwise create new one
  const task =
    options.existingTask ??
    createTask(workflowId, workflowInput, options.source, {
      chatId: options.chatId,
    });
  if (!options.existingTask) {
    saveTask(task);
  }

  // Await the workflow start message to ensure it's sent before step messages
  await options.config.onProgress?.(
    task.taskId,
    "_start",
    `📋 Start: ${workflow.title}`,
  );

  // Build execution context
  // Wrap onProgress to also save to task storage
  const wrappedOnProgress = options.config.onProgress
    ? (taskId: string, stepName: string, message: string) => {
        // Save to task JSON for persistence
        const saved = addStepProgress(taskId, stepName, message);
        console.error(
          `[pilot] Progress persisted: ${stepName} → ${message.slice(0, 50)}... (saved: ${!!saved})`,
        );
        // Call the original callback for event publishing
        options.config.onProgress!(taskId, stepName, message);
      }
    : undefined;

  // logToTask: save to task JSON but DON'T publish to event bus
  // Used for verbose tool results that shouldn't appear in WhatsApp
  const logToTask = (taskId: string, stepName: string, message: string) => {
    const saved = addStepProgress(taskId, stepName, message);
    console.error(
      `[pilot] Task log: ${stepName} → ${message.slice(0, 100)}... (saved: ${!!saved})`,
    );
  };

  const ctx: ExecutionContext = {
    task,
    workflow,
    stepOutputs: {},
    workflowInput,
    onProgress: wrappedOnProgress,
    logToTask,
    onModeChange: options.config.onModeChange,
    callLLM: options.callLLM,
    callMeshTool: options.callMeshTool,
    listConnections: options.listConnections,
    publishEvent: options.publishEvent,
  };

  try {
    // Group steps by level for parallel execution
    const stepLevels = groupStepsByLevel(workflow.steps);

    for (const levelSteps of stepLevels) {
      // Execute all steps in this level in parallel
      const results = await Promise.all(
        levelSteps.map(async (step) => {
          const stepId = `${task.taskId}_${step.name}`;
          const startedAt = new Date().toISOString();

          // Create step result
          const stepResult: StepResult = {
            stepId,
            stepName: step.name,
            startedAt,
            status: "working",
            progressMessages: [],
          };

          updateTaskStep(task.taskId, workflow.steps.indexOf(step), stepResult);

          try {
            const { output, skipped } = await executeStep(
              step,
              ctx,
              options.config,
            );

            // Validate output against schema if defined
            if (!skipped && step.outputSchema && output) {
              const validation = validateOutputSchema(
                output,
                step.outputSchema,
                step.name,
              );
              if (!validation.valid) {
                throw new Error(
                  `Output validation failed for step "${step.name}": ${validation.errors.join(", ")}`,
                );
              }
            }

            // Update step result
            stepResult.status = skipped ? "completed" : "completed";
            stepResult.completedAt = new Date().toISOString();
            stepResult.output = skipped ? { skipped: true } : output;

            updateTaskStep(
              task.taskId,
              workflow.steps.indexOf(step),
              stepResult,
            );

            return { step, output, skipped };
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : String(error);

            stepResult.status = "failed";
            stepResult.completedAt = new Date().toISOString();
            stepResult.error = errorMsg;

            updateTaskStep(
              task.taskId,
              workflow.steps.indexOf(step),
              stepResult,
            );

            if (!step.config?.continueOnError) {
              throw error;
            }

            return { step, output: null, skipped: false, error: errorMsg };
          }
        }),
      );

      // Store outputs for reference in next level
      for (const { step, output, skipped } of results) {
        // If step was skipped, don't store its output - let the previous value remain
        if (!skipped) {
          ctx.stepOutputs[step.name] = output;
        }
      }
    }

    // Get final output (from last non-skipped step)
    let finalOutput: unknown = null;
    for (let i = workflow.steps.length - 1; i >= 0; i--) {
      const stepOutput = ctx.stepOutputs[workflow.steps[i].name];
      if (stepOutput !== undefined) {
        finalOutput = stepOutput;
        break;
      }
    }

    // Complete task
    completeTask(task.taskId, finalOutput);

    options.config.onProgress?.(
      task.taskId,
      "_end",
      `✅ Done: ${workflow.title}`,
    );

    return {
      task: loadTask(task.taskId) || task,
      result: finalOutput,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    failTask(task.taskId, errorMsg);

    options.config.onProgress?.(task.taskId, "_error", `❌ ${errorMsg}`);

    return {
      task: loadTask(task.taskId) || task,
      result: null,
    };
  }
}

/**
 * Resume a task from where it left off
 */
export async function resumeTask(
  taskId: string,
  options: {
    config: ExecutorConfig;
    callLLM: LLMCallback;
    callMeshTool: MeshToolCallback;
    listConnections: ListConnectionsCallback;
  },
): Promise<{ task: Task; result: unknown } | null> {
  const task = loadTask(taskId);
  if (!task) return null;

  // Can only resume working or input_required tasks
  if (task.status !== "working" && task.status !== "input_required") {
    return { task, result: task.result };
  }

  const workflow = loadWorkflow(task.workflowId);
  if (!workflow) {
    failTask(taskId, `Workflow not found: ${task.workflowId}`);
    return { task: loadTask(taskId)!, result: null };
  }

  // Build context from existing step results
  const stepOutputs: Record<string, unknown> = {};
  for (const result of task.stepResults) {
    if (result.status === "completed" && result.output !== undefined) {
      stepOutputs[result.stepName] = result.output;
    }
  }

  // Wrap onProgress to also save to task storage
  const wrappedOnProgress = options.config.onProgress
    ? (taskId: string, stepName: string, message: string) => {
        addStepProgress(taskId, stepName, message);
        options.config.onProgress!(taskId, stepName, message);
      }
    : undefined;

  // logToTask: save to task JSON but DON'T publish to event bus
  const logToTask = (taskId: string, stepName: string, message: string) => {
    addStepProgress(taskId, stepName, message);
    console.error(
      `[pilot] Task log: ${stepName} → ${message.slice(0, 100)}...`,
    );
  };

  const ctx: ExecutionContext = {
    task,
    workflow,
    stepOutputs,
    workflowInput: task.workflowInput,
    onProgress: wrappedOnProgress,
    logToTask,
    onModeChange: options.config.onModeChange,
    callLLM: options.callLLM,
    callMeshTool: options.callMeshTool,
    listConnections: options.listConnections,
  };

  try {
    // Find remaining steps
    const completedSteps = new Set(
      task.stepResults
        .filter((r) => r.status === "completed")
        .map((r) => r.stepName),
    );

    const remainingSteps = workflow.steps.filter(
      (s) => !completedSteps.has(s.name),
    );

    if (remainingSteps.length === 0) {
      // All steps completed, finalize
      const lastStep = workflow.steps[workflow.steps.length - 1];
      const finalOutput = stepOutputs[lastStep.name];
      completeTask(taskId, finalOutput);
      return { task: loadTask(taskId)!, result: finalOutput };
    }

    // Execute remaining steps
    for (const step of remainingSteps) {
      const stepId = `${taskId}_${step.name}`;
      const startedAt = new Date().toISOString();

      const stepResult: StepResult = {
        stepId,
        stepName: step.name,
        startedAt,
        status: "working",
        progressMessages: [],
      };

      updateTaskStep(taskId, workflow.steps.indexOf(step), stepResult);

      const { output, skipped } = await executeStep(step, ctx, options.config);

      // Validate output against schema if defined
      if (!skipped && step.outputSchema && output) {
        const validation = validateOutputSchema(
          output,
          step.outputSchema,
          step.name,
        );
        if (!validation.valid) {
          throw new Error(
            `Output validation failed for step "${step.name}": ${validation.errors.join(", ")}`,
          );
        }
      }

      stepResult.status = "completed";
      stepResult.completedAt = new Date().toISOString();
      stepResult.output = skipped ? { skipped: true } : output;

      updateTaskStep(taskId, workflow.steps.indexOf(step), stepResult);
      if (!skipped) {
        ctx.stepOutputs[step.name] = output;
      }
    }

    // Get final output (from last non-skipped step)
    let finalOutput: unknown = null;
    for (let i = workflow.steps.length - 1; i >= 0; i--) {
      const stepOutput = ctx.stepOutputs[workflow.steps[i].name];
      if (stepOutput !== undefined) {
        finalOutput = stepOutput;
        break;
      }
    }

    completeTask(taskId, finalOutput);

    return { task: loadTask(taskId)!, result: finalOutput };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    failTask(taskId, errorMsg);
    return { task: loadTask(taskId)!, result: null };
  }
}
