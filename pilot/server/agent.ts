/**
 * Pilot Agent
 *
 * Two-phase AI agent architecture:
 * - FAST: Quick routing and planning (discovers tools, creates execution plan)
 * - SMART: Detailed execution (executes the plan with selected tools)
 */

import type { Tool, ToolResult } from "./tools/system.ts";
import { getAllLocalTools } from "./tools/index.ts";
import {
  createTask,
  updateTaskStatus,
  addTaskProgress,
  addToolUsed,
  type Task,
} from "./task-manager.ts";

// ============================================================================
// Types
// ============================================================================

export interface AgentConfig {
  /** Model for routing (fast/cheap) */
  fastModel: string;
  /** Model for execution (smart/capable) */
  smartModel?: string;
  /** Max tokens for responses */
  maxTokens?: number;
  /** Temperature */
  temperature?: number;
  /** Max router iterations */
  maxRouterIterations?: number;
  /** Max executor iterations */
  maxExecutorIterations?: number;
}

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface MeshConnection {
  id: string;
  title: string;
  tools: Array<{
    name: string;
    description?: string;
    inputSchema?: unknown;
  }>;
}

export interface AgentContext {
  /** Source interface (whatsapp, cli, etc.) */
  source: string;
  /** Chat/conversation ID */
  chatId?: string;
  /** Callback to call LLM */
  callLLM: (
    model: string,
    messages: Message[],
    tools: ToolDefinition[],
  ) => Promise<LLMResponse>;
  /** Callback to call mesh tool */
  callMeshTool: (
    connectionId: string,
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
  /** Callback to list mesh connections */
  listConnections: () => Promise<MeshConnection[]>;
  /** Callback for progress updates */
  onProgress?: (message: string) => void;
  /** Callback for mode changes */
  onModeChange?: (mode: "FAST" | "SMART") => void;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface LLMResponse {
  text?: string;
  toolCalls?: Array<{
    name: string;
    arguments: Record<string, unknown>;
  }>;
}

export interface ExecutionPlan {
  task: string;
  context?: string;
  tools: Array<{
    name: string;
    source: "local" | "mesh";
    connectionId?: string;
  }>;
}

// ============================================================================
// Agent Class
// ============================================================================

export class PilotAgent {
  private config: Required<AgentConfig>;
  private ctx: AgentContext;
  private currentTask: Task | null = null;
  private currentMode: "FAST" | "SMART" = "FAST";
  private localTools: Tool[];

  constructor(config: AgentConfig, ctx: AgentContext) {
    this.config = {
      maxTokens: 2048,
      temperature: 0.7,
      maxRouterIterations: 10,
      maxExecutorIterations: 30,
      smartModel: config.smartModel || config.fastModel,
      ...config,
    };
    this.ctx = ctx;
    this.localTools = getAllLocalTools();
  }

  // ==========================================================================
  // Progress & Mode Tracking
  // ==========================================================================

  private sendProgress(message: string): void {
    this.ctx.onProgress?.(message);
    if (this.currentTask) {
      addTaskProgress(this.currentTask.id, message);
    }
  }

  private trackToolUsed(toolName: string): void {
    if (this.currentTask) {
      addToolUsed(this.currentTask.id, toolName);
    }
  }

  private setMode(mode: "FAST" | "SMART"): void {
    if (this.currentMode !== mode) {
      this.currentMode = mode;
      this.ctx.onModeChange?.(mode);
    }
  }

  // ==========================================================================
  // Main Entry Point
  // ==========================================================================

  async run(
    userMessage: string,
    conversationHistory: Message[] = [],
  ): Promise<{ response: string; task: Task }> {
    console.error(
      `\n[FAST] ─── ${userMessage.slice(0, 80)}${userMessage.length > 80 ? "..." : ""}`,
    );

    // Create task for tracking
    const task = createTask(userMessage, this.ctx.source, this.ctx.chatId);
    this.currentTask = task;

    this.sendProgress("🔍 Analyzing request...");
    this.setMode("FAST");

    try {
      const response = await this.runRouter(userMessage, conversationHistory);
      updateTaskStatus(task.id, "completed", response);
      this.currentTask = null;
      return { response, task };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(`[Agent] Fatal error: ${errorMsg}`);
      this.sendProgress(`❌ Error: ${errorMsg}`);

      updateTaskStatus(task.id, "error", undefined, errorMsg);
      this.currentTask = null;

      return {
        response: `Sorry, I encountered an error: ${errorMsg}`,
        task,
      };
    }
  }

  // ==========================================================================
  // Phase 1: Router
  // ==========================================================================

  private async runRouter(
    userMessage: string,
    conversationHistory: Message[],
  ): Promise<string> {
    const systemPrompt = this.getRouterSystemPrompt();
    const messages: Message[] = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.slice(-4),
      { role: "user", content: userMessage },
    ];

    const routerTools = this.getRouterTools();
    const usedTools: string[] = [];
    const toolCallCounts = new Map<string, number>();
    const MAX_SAME_TOOL = 5;

    for (let i = 0; i < this.config.maxRouterIterations; i++) {
      const result = await this.ctx.callLLM(
        this.config.fastModel,
        messages,
        routerTools,
      );

      // No tool calls = direct response
      if (!result.toolCalls || result.toolCalls.length === 0) {
        if (usedTools.length > 0) {
          console.error(`[FAST] Tools used: ${usedTools.join(" → ")}`);
        }
        return result.text || "I couldn't generate a response.";
      }

      // Process tool calls
      for (const tc of result.toolCalls) {
        // Loop detection
        const callCount = (toolCallCounts.get(tc.name) || 0) + 1;
        toolCallCounts.set(tc.name, callCount);

        if (callCount > MAX_SAME_TOOL) {
          console.error(
            `[FAST] ⚠️ Skipping ${tc.name} (called ${callCount} times)`,
          );
          messages.push({
            role: "user",
            content: `[Warning] You already called ${tc.name} ${callCount - 1} times. Use the results you have.`,
          });
          continue;
        }

        usedTools.push(tc.name);

        const toolResult = await this.executeRouterTool(tc.name, tc.arguments);

        // execute_task returns final response
        if (tc.name === "execute_task" && typeof toolResult === "string") {
          console.error(`[FAST] Tools used: ${usedTools.join(" → ")}`);
          return toolResult;
        }

        // Add result to messages
        messages.push({
          role: "assistant",
          content: result.text || `Calling ${tc.name}...`,
        });
        messages.push({
          role: "user",
          content: `[Tool Result for ${tc.name}]:\n${JSON.stringify(toolResult, null, 2)}`,
        });
      }
    }

    console.error(
      `[FAST] Tools used: ${usedTools.join(" → ")} (limit reached)`,
    );
    return "I couldn't complete the request within the iteration limit.";
  }

  // ==========================================================================
  // Phase 2: Executor
  // ==========================================================================

  private async runExecutor(
    plan: ExecutionPlan,
    conversationHistory: Message[],
  ): Promise<string> {
    console.error(
      `\n[SMART] ─── Task: ${plan.task.slice(0, 60)}${plan.task.length > 60 ? "..." : ""}`,
    );
    console.error(
      `[SMART] Tools requested: ${plan.tools.map((t) => t.name).join(", ")}`,
    );

    // Load tools for execution
    const loadedTools = await this.loadToolsForExecution(plan.tools);

    console.error(
      `[SMART] Available: ${loadedTools.map((t) => t.name).join(", ")}`,
    );

    // Build executor prompt
    const executorPrompt = this.getExecutorPrompt(plan);

    const messages: Message[] = [
      { role: "system", content: executorPrompt },
      ...conversationHistory.slice(-4),
      { role: "user", content: plan.task },
    ];

    const toolDefs = loadedTools.map((t) => ({
      name: t.def.name,
      description: t.def.description,
      inputSchema: t.def.inputSchema,
    }));

    // Loop detection
    let lastToolCall: string | null = null;
    let consecutiveRepeats = 0;
    const MAX_CONSECUTIVE_REPEATS = 3;

    for (let i = 0; i < this.config.maxExecutorIterations; i++) {
      const result = await this.ctx.callLLM(
        this.config.smartModel,
        messages,
        toolDefs,
      );

      if (!result.toolCalls || result.toolCalls.length === 0) {
        this.sendProgress("✅ Done!");
        return result.text || "Task completed.";
      }

      // Execute tool calls
      for (const tc of result.toolCalls) {
        const callSignature = `${tc.name}:${JSON.stringify(tc.arguments)}`;
        if (callSignature === lastToolCall) {
          consecutiveRepeats++;
          if (consecutiveRepeats >= MAX_CONSECUTIVE_REPEATS) {
            console.error(
              `[SMART] ⚠️ Loop detected: ${tc.name} called ${consecutiveRepeats} times`,
            );
            this.sendProgress(`⚠️ Stopped (loop detected)`);
            return `I got stuck in a loop calling ${tc.name}. The task may be partially complete.`;
          }
        } else {
          consecutiveRepeats = 1;
          lastToolCall = callSignature;
        }

        const toolDef = loadedTools.find((t) => t.def.name === tc.name);
        if (!toolDef) {
          messages.push({
            role: "user",
            content: `[Tool Error]: Unknown tool ${tc.name}`,
          });
          continue;
        }

        console.error(`[SMART] → ${tc.name}(${this.formatArgs(tc.arguments)})`);
        this.trackToolUsed(tc.name);
        this.sendProgress(`⚡ ${tc.name}...`);

        const startTime = Date.now();
        let toolResult: unknown;

        try {
          toolResult = await toolDef.execute(tc.arguments);
          const duration = Date.now() - startTime;
          console.error(`[SMART] ✓ ${tc.name} (${duration}ms)`);
        } catch (error) {
          const duration = Date.now() - startTime;
          console.error(
            `[SMART] ✗ ${tc.name} (${duration}ms): ${error instanceof Error ? error.message : "Error"}`,
          );
          this.sendProgress(`❌ ${tc.name} failed`);
          toolResult = {
            error: error instanceof Error ? error.message : "Tool failed",
          };
        }

        messages.push({
          role: "assistant",
          content: result.text || `Calling ${tc.name}...`,
        });
        messages.push({
          role: "user",
          content: `[Tool Result for ${tc.name}]:\n${JSON.stringify(toolResult, null, 2).slice(0, 3000)}`,
        });
      }
    }

    this.sendProgress("⚠️ Reached iteration limit");
    return "Task execution reached iteration limit without completing.";
  }

  // ==========================================================================
  // Router Tools
  // ==========================================================================

  private getRouterTools(): ToolDefinition[] {
    return [
      {
        name: "list_local_tools",
        description:
          "List available local system tools (files, shell, speech, etc.)",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "list_mesh_tools",
        description:
          "List available MCP mesh tools from external connections. READ DESCRIPTIONS - they contain important instructions!",
        inputSchema: {
          type: "object",
          properties: {
            connectionId: {
              type: "string",
              description: "Optional: filter by specific connection ID",
            },
          },
        },
      },
      {
        name: "explore_files",
        description: "List files in a directory to discover project structure.",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Directory path to explore" },
          },
          required: ["path"],
        },
      },
      {
        name: "peek_file",
        description:
          "Read a file to understand its contents (first 200 lines).",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path to read" },
          },
          required: ["path"],
        },
      },
      {
        name: "execute_task",
        description: `Execute a task with a detailed plan. Include ALL tools needed.

Example:
{
  "task": "Write an article about MCP:\\n1. Read context files\\n2. Create article with proper tone",
  "tools": [
    {"name": "READ_FILE", "source": "local"},
    {"name": "COLLECTION_ARTICLES_CREATE", "source": "mesh", "connectionId": "conn_abc"}
  ]
}`,
        inputSchema: {
          type: "object",
          properties: {
            task: { type: "string", description: "Detailed step-by-step plan" },
            context: { type: "string", description: "Notes for the executor" },
            tools: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  source: { type: "string", enum: ["local", "mesh"] },
                  connectionId: { type: "string" },
                },
                required: ["name", "source"],
              },
            },
          },
          required: ["task", "tools"],
        },
      },
    ];
  }

  private async executeRouterTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    switch (name) {
      case "list_local_tools": {
        const tools = this.localTools.map((t) => ({
          name: t.name,
          description: t.description.slice(0, 100),
          source: "local",
        }));
        this.sendProgress(`📦 Found ${tools.length} local tools`);
        return { tools, count: tools.length };
      }

      case "list_mesh_tools": {
        try {
          const connections = await this.ctx.listConnections();
          const allTools = connections.flatMap((c) =>
            c.tools.map((t) => ({
              name: t.name,
              description: (t.description || "").slice(0, 150),
              connectionId: c.id,
              connectionName: c.title,
            })),
          );
          this.sendProgress(
            `🔌 Found ${allTools.length} mesh tools from ${connections.length} connections`,
          );
          return {
            allTools,
            totalToolCount: allTools.length,
            hint: "Select MULTIPLE related tools for the task.",
          };
        } catch (error) {
          return { error: "Failed to list mesh tools" };
        }
      }

      case "explore_files": {
        const path = args.path as string;
        const listTool = this.localTools.find((t) => t.name === "LIST_FILES");
        if (!listTool) return { error: "LIST_FILES not available" };

        const result = await listTool.execute({ path });
        if (result.content?.[0]?.text) {
          try {
            const parsed = JSON.parse(result.content[0].text);
            this.sendProgress(`📂 Found ${parsed.count || 0} items`);
            return parsed;
          } catch {
            return result;
          }
        }
        return result;
      }

      case "peek_file": {
        const path = args.path as string;
        const readTool = this.localTools.find((t) => t.name === "READ_FILE");
        if (!readTool) return { error: "READ_FILE not available" };

        const result = await readTool.execute({ path, limit: 200 });
        if (result.content?.[0]?.text) {
          try {
            const parsed = JSON.parse(result.content[0].text);
            this.sendProgress(`📄 Read ${path.split("/").pop()}`);
            return {
              path: parsed.path,
              preview: parsed.content?.slice(0, 3000),
              totalLines: parsed.totalLines,
            };
          } catch {
            return result;
          }
        }
        return result;
      }

      case "execute_task": {
        const task = args.task as string;
        const context = args.context as string | undefined;
        const tools = args.tools as ExecutionPlan["tools"];

        if (!task || !tools || tools.length === 0) {
          return { error: "Missing task or tools" };
        }

        this.sendProgress(
          `🧠 Starting execution with ${tools.length} tools...`,
        );
        this.setMode("SMART");

        const result = await this.runExecutor(
          { task, context, tools },
          [], // Will use internal history
        );

        this.setMode("FAST");
        return result;
      }

      default:
        return { error: `Unknown router tool: ${name}` };
    }
  }

  // ==========================================================================
  // Tool Loading
  // ==========================================================================

  private async loadToolsForExecution(
    toolRequests: ExecutionPlan["tools"],
  ): Promise<
    Array<{
      def: ToolDefinition;
      execute: (args: Record<string, unknown>) => Promise<unknown>;
    }>
  > {
    const loaded: Array<{
      def: ToolDefinition;
      execute: (args: Record<string, unknown>) => Promise<unknown>;
    }> = [];

    const connections = await this.ctx.listConnections();

    for (const req of toolRequests) {
      if (req.source === "local") {
        const tool = this.localTools.find((t) => t.name === req.name);
        if (tool) {
          loaded.push({
            def: {
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema,
            },
            execute: async (args) => {
              const result = await tool.execute(args);
              // Parse JSON from content if needed
              if (result.content?.[0]?.text) {
                try {
                  return JSON.parse(result.content[0].text);
                } catch {
                  return result.content[0].text;
                }
              }
              return result;
            },
          });
        }
      } else if (req.source === "mesh") {
        let connectionId = req.connectionId;

        // Find connection with this tool if not specified
        if (!connectionId) {
          const conn = connections.find((c) =>
            c.tools.some((t) => t.name === req.name),
          );
          if (conn) connectionId = conn.id;
        }

        if (connectionId) {
          const conn = connections.find((c) => c.id === connectionId);
          const toolDef = conn?.tools.find((t) => t.name === req.name);

          if (toolDef) {
            const cid = connectionId; // Capture for closure
            loaded.push({
              def: {
                name: toolDef.name,
                description: toolDef.description || "",
                inputSchema:
                  (toolDef.inputSchema as Record<string, unknown>) || {},
              },
              execute: (args) => this.ctx.callMeshTool(cid, req.name, args),
            });
          }
        }
      }
    }

    return loaded;
  }

  // ==========================================================================
  // Prompts
  // ==========================================================================

  private getRouterSystemPrompt(): string {
    return `You are PILOT, a FAST PLANNING agent. Your job is to:
1. Understand what the user wants
2. Explore available tools AND relevant files
3. Create a detailed execution plan for the SMART executor

**Your Tools:**
- list_local_tools: See file/shell/notification tools
- list_mesh_tools: See API tools from the mesh (READ DESCRIPTIONS!)
- explore_files: List directory contents
- peek_file: Read a file to see if it's relevant
- execute_task: Hand off to SMART executor with plan + tools

**WORKFLOW:**
1. DISCOVER: Call list_local_tools() AND list_mesh_tools()
2. EXPLORE: If user mentions files/projects, use explore_files and peek_file
3. EXECUTE: Call execute_task with detailed plan and ALL needed tools

**RULES:**
- Simple questions → respond directly (no tools)
- "List tools" requests → call list_mesh_tools, respond with results
- Complex tasks → discover, explore, then execute_task
- Match user's language (PT/EN)
- Keep responses SHORT and helpful`;
  }

  private getExecutorPrompt(plan: ExecutionPlan): string {
    let prompt = `You are a SMART EXECUTOR agent. Complete the task step-by-step.

**TASK TO COMPLETE:**
${plan.task}

**RULES:**
1. Execute each step in order
2. Use tools via function calling (never simulate)
3. Complete the ENTIRE task before responding
4. For content creation, write actual content (not placeholders)
5. Summarize what you accomplished`;

    if (plan.context) {
      prompt += `

**CONTEXT:**
${plan.context}`;
    }

    return prompt;
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private formatArgs(args: Record<string, unknown>): string {
    const keys = Object.keys(args);
    if (keys.length === 0) return "{}";
    if (keys.length <= 3) {
      return keys
        .map((k) => {
          const v = args[k];
          if (typeof v === "string")
            return `${k}:"${v.slice(0, 30)}${v.length > 30 ? "..." : ""}"`;
          return `${k}:${typeof v}`;
        })
        .join(", ");
    }
    return keys.join(", ");
  }
}
