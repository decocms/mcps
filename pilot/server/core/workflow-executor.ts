/**
 * Workflow Executor
 *
 * Executes workflows step-by-step, tracking progress in task files.
 * Each step is logged to the task JSON file for debugging and progress reporting.
 */

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
  addStepProgress,
  completeTask,
  failTask,
} from "./task-storage.ts";
import { loadWorkflow } from "./workflow-storage.ts";

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
  /** Progress callback */
  onProgress?: (taskId: string, stepName: string, message: string) => void;
  /** Mode change callback */
  onModeChange?: (mode: "FAST" | "SMART") => void;
  /** Tool execution callbacks */
  callLLM: LLMCallback;
  callMeshTool: MeshToolCallback;
  listConnections: ListConnectionsCallback;
  /** Tool cache - populated by first step, reused by subsequent steps */
  toolCache?: Map<string, ToolDefinition>;
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

    return {
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

  ctx.onProgress?.(
    ctx.task.taskId,
    step.name,
    `🧠 ${model.toUpperCase()}: Starting...`,
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
      console.log(
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
  console.log(
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
      console.log(
        `[pilot] [${step.name}] LLM final response: ${result.text?.slice(0, 200)}...`,
      );

      ctx.onProgress?.(
        ctx.task.taskId,
        step.name,
        `✓ ${model.toUpperCase()}: Done`,
      );

      // Try to parse structured output from the LLM
      const parsed = parseStructuredOutput(result.text || "");

      // Ensure we always have a response
      const finalResponse =
        parsed.response || result.text || "(Task completed)";

      return {
        response: finalResponse,
        taskForSmartAgent: parsed.taskForSmartAgent, // Only set if delegation needed
        toolsForSmartAgent: parsed.toolsForSmartAgent, // Only set if delegation needed
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
        const toolResult = await executeToolCall(tc.name, tc.arguments, ctx);

        // Add to messages
        messages.push({
          role: "assistant",
          content: result.text || `Calling ${tc.name}...`,
        });
        messages.push({
          role: "user",
          content: `[Tool Result for ${tc.name}]:\n${JSON.stringify(toolResult, null, 2).slice(0, 3000)}`,
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

  ctx.onProgress?.(
    ctx.task.taskId,
    step.name,
    `⚠️ ${model.toUpperCase()}: Reached iteration limit`,
  );

  return {
    response: "Reached iteration limit without completing.",
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
        console.log(`[pilot] Tool ${name}: found in cache with schema`);
      } else {
        // Fallback: try to find in connections
        console.log(`[pilot] Tool ${name}: not in cache, fetching...`);
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
): Promise<unknown> {
  // Check if it's a built-in router tool
  switch (toolName) {
    case "list_local_tools":
      return {
        tools: ["READ_FILE", "WRITE_FILE", "LIST_FILES", "SHELL", "SPEAK"],
        count: 5,
      };

    case "list_mesh_tools": {
      const connections = await ctx.listConnections();
      const allTools = connections.flatMap((c) =>
        c.tools.map((t) => ({
          name: t.name,
          description: (t.description || "").slice(0, 150),
          connectionId: c.id,
          connectionName: c.title,
        })),
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
  },
): Promise<{ task: Task; result: unknown }> {
  // Load workflow
  const workflow = loadWorkflow(workflowId);
  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  // Create task
  const task = createTask(workflowId, workflowInput, options.source, {
    chatId: options.chatId,
  });
  saveTask(task);

  options.config.onProgress?.(
    task.taskId,
    "_start",
    `📋 Starting workflow: ${workflow.title}`,
  );

  // Build execution context
  const ctx: ExecutionContext = {
    task,
    workflow,
    stepOutputs: {},
    workflowInput,
    onProgress: options.config.onProgress,
    onModeChange: options.config.onModeChange,
    callLLM: options.callLLM,
    callMeshTool: options.callMeshTool,
    listConnections: options.listConnections,
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

    options.config.onProgress?.(task.taskId, "_end", `✅ Workflow completed`);

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

  const ctx: ExecutionContext = {
    task,
    workflow,
    stepOutputs,
    workflowInput: task.workflowInput,
    onProgress: options.config.onProgress,
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
