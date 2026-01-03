/**
 * Workflow Storage
 *
 * File-based workflow persistence.
 * - Built-in workflows in pilot/workflows/
 * - Custom workflows in CUSTOM_WORKFLOWS_DIR (takes precedence)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Workflow } from "../types/workflow.ts";

/**
 * Expand ~ to home directory
 */
function expandPath(p: string): string {
  if (p.startsWith("~/")) {
    return path.join(process.env.HOME || "/tmp", p.slice(2));
  }
  return p;
}

// Built-in workflows directory - relative to pilot project
const BUILTIN_WORKFLOWS_DIR = path.join(
  import.meta.dirname,
  "..",
  "..",
  "workflows",
);

/**
 * Get custom workflows directory from environment
 */
function getCustomWorkflowsDir(): string | null {
  const envDir = process.env.CUSTOM_WORKFLOWS_DIR;
  if (envDir) {
    return expandPath(envDir);
  }
  return null;
}

/**
 * Ensure built-in directory exists
 */
function ensureBuiltinDir() {
  if (!fs.existsSync(BUILTIN_WORKFLOWS_DIR)) {
    fs.mkdirSync(BUILTIN_WORKFLOWS_DIR, { recursive: true });
  }
}

/**
 * Find workflow file path (checks custom dir first, then built-in)
 */
function findWorkflowPath(workflowId: string): string | null {
  const customDir = getCustomWorkflowsDir();

  // Check custom directory first
  if (customDir) {
    const customPath = path.join(customDir, `${workflowId}.json`);
    if (fs.existsSync(customPath)) {
      return customPath;
    }
  }

  // Fall back to built-in
  const builtinPath = path.join(BUILTIN_WORKFLOWS_DIR, `${workflowId}.json`);
  if (fs.existsSync(builtinPath)) {
    return builtinPath;
  }

  return null;
}

/**
 * Save a workflow to disk (saves to custom dir if set, otherwise built-in)
 */
export function saveWorkflow(workflow: Workflow): void {
  const customDir = getCustomWorkflowsDir();
  const targetDir = customDir || BUILTIN_WORKFLOWS_DIR;

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const filePath = path.join(targetDir, `${workflow.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2));
}

/**
 * Load a workflow from disk
 */
export function loadWorkflow(workflowId: string): Workflow | null {
  const filePath = findWorkflowPath(workflowId);
  if (!filePath) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as Workflow;
  } catch (error) {
    console.error(
      `[WorkflowStorage] Failed to load workflow ${workflowId}:`,
      error,
    );
    return null;
  }
}

/**
 * Delete a workflow from disk
 */
export function deleteWorkflow(workflowId: string): boolean {
  const filePath = findWorkflowPath(workflowId);
  if (!filePath) {
    return false;
  }

  try {
    fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * List all workflows (merges custom + built-in, custom takes precedence)
 */
export function listWorkflows(): Workflow[] {
  const workflowMap = new Map<string, Workflow>();

  // Load built-in workflows first
  ensureBuiltinDir();
  const builtinFiles = fs
    .readdirSync(BUILTIN_WORKFLOWS_DIR)
    .filter((f) => f.endsWith(".json"));

  for (const file of builtinFiles) {
    const workflowId = file.replace(".json", "");
    try {
      const content = fs.readFileSync(
        path.join(BUILTIN_WORKFLOWS_DIR, file),
        "utf-8",
      );
      const workflow = JSON.parse(content) as Workflow;
      workflowMap.set(workflowId, workflow);
    } catch {
      // Skip invalid files
    }
  }

  // Load custom workflows (override built-in)
  const customDir = getCustomWorkflowsDir();
  if (customDir && fs.existsSync(customDir)) {
    const customFiles = fs
      .readdirSync(customDir)
      .filter((f) => f.endsWith(".json"));

    for (const file of customFiles) {
      const workflowId = file.replace(".json", "");
      try {
        const content = fs.readFileSync(path.join(customDir, file), "utf-8");
        const workflow = JSON.parse(content) as Workflow;
        workflowMap.set(workflowId, workflow);
      } catch {
        // Skip invalid files
      }
    }
  }

  return Array.from(workflowMap.values()).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
}

/**
 * Check if workflow exists
 */
export function workflowExists(workflowId: string): boolean {
  return findWorkflowPath(workflowId) !== null;
}

/**
 * Get the default agent loop workflow
 */
export function getDefaultWorkflow(): Workflow {
  const wfId = process.env.DEFAULT_WORKFLOW || "default-agent-loop";
  return loadWorkflow(wfId) ?? createDefaultAgentLoopWorkflow();
}

/**
 * Create the default agent loop workflow (fast → smart)
 */
function createDefaultAgentLoopWorkflow(): Workflow {
  return {
    id: "default-agent-loop",
    title: "Default Agent Loop",
    description: "Two-phase agent: FAST routing + SMART execution",
    steps: [
      {
        name: "fast_routing",
        description:
          "Quick routing and planning - discovers tools, creates execution plan",
        action: {
          type: "llm",
          prompt: "@input.message",
          model: "fast",
          systemPrompt: `You are PILOT, a FAST PLANNING agent. Your job is to:
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
- Keep responses SHORT and helpful`,
          tools: "discover",
          maxIterations: 10,
        },
        input: {
          message: "@input.message",
          history: "@input.history",
        },
      },
      {
        name: "smart_execution",
        description: "Execute the plan with selected tools",
        action: {
          type: "llm",
          prompt: "@fast_routing.task",
          model: "smart",
          systemPrompt: `You are a SMART EXECUTOR agent. Complete the task step-by-step.

**RULES:**
1. Execute each step in order
2. Use tools via function calling (never simulate)
3. Complete the ENTIRE task before responding
4. For content creation, write actual content (not placeholders)
5. Summarize what you accomplished`,
          tools: "all",
          maxIterations: 30,
        },
        input: {
          task: "@fast_routing.task",
          tools: "@fast_routing.tools",
          context: "@fast_routing.context",
        },
        config: {
          continueOnError: false,
        },
      },
    ],
  };
}

/**
 * Initialize default workflows if they don't exist
 */
export function initializeDefaultWorkflows(): void {
  ensureBuiltinDir();

  // Create default agent loop if it doesn't exist
  if (!workflowExists("default-agent-loop")) {
    // Save to built-in dir explicitly
    const filePath = path.join(
      BUILTIN_WORKFLOWS_DIR,
      "default-agent-loop.json",
    );
    fs.writeFileSync(
      filePath,
      JSON.stringify(createDefaultAgentLoopWorkflow(), null, 2),
    );
    console.error("[WorkflowStorage] Created default-agent-loop workflow");
  }

  // Create simple direct workflow (no routing, direct execution)
  if (!workflowExists("direct-execution")) {
    const workflow: Workflow = {
      id: "direct-execution",
      title: "Direct Execution",
      description: "Skip routing, execute directly with all available tools",
      steps: [
        {
          name: "execute",
          description: "Direct execution with smart model",
          action: {
            type: "llm",
            prompt: "@input.message",
            model: "smart",
            tools: "all",
            maxIterations: 30,
          },
          input: {
            message: "@input.message",
            history: "@input.history",
          },
        },
      ],
    };
    const filePath = path.join(BUILTIN_WORKFLOWS_DIR, "direct-execution.json");
    fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2));
    console.error("[WorkflowStorage] Created direct-execution workflow");
  }

  // Create research workflow (reads context files first)
  if (!workflowExists("research-first")) {
    const workflow: Workflow = {
      id: "research-first",
      title: "Research First",
      description: "Read context files before responding",
      steps: [
        {
          name: "gather_context",
          description: "Read relevant context files",
          action: {
            type: "tool",
            toolName: "READ_FILE",
          },
          input: {
            path: "@input.contextPath",
          },
        },
        {
          name: "respond",
          description: "Respond with gathered context",
          action: {
            type: "llm",
            prompt: `Context:\n@gather_context.content\n\nUser message: @input.message`,
            model: "smart",
            tools: "all",
          },
          input: {
            message: "@input.message",
            context: "@gather_context.content",
          },
        },
      ],
    };
    const filePath = path.join(BUILTIN_WORKFLOWS_DIR, "research-first.json");
    fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2));
    console.error("[WorkflowStorage] Created research-first workflow");
  }

  // Create conversation workflow
  if (!workflowExists("conversation")) {
    const workflow: Workflow = {
      id: "conversation",
      title: "Conversation",
      description:
        "Long-running conversation thread. Messages are routed here until timeout or end.",
      steps: [
        {
          name: "conversation_loop",
          description: "Continuous conversation with the user",
          action: {
            type: "llm",
            prompt: "@input.message",
            model: "fast",
            systemPrompt: `You are in CONVERSATION MODE. This is an ongoing dialogue, not a one-shot task.

**RULES:**
1. Be conversational and engaging
2. Remember context from previous messages (in history)
3. Ask clarifying questions if needed
4. Use tools when the user requests actions
5. Match the user's language (PT/EN)
6. If the user says goodbye or the conversation seems done, respond with [END_CONVERSATION]

You have access to all available tools. Use them naturally in the conversation.`,
            tools: "all",
            maxIterations: 10,
          },
          input: {
            message: "@input.message",
            history: "@input.history",
          },
        },
      ],
    };
    const filePath = path.join(BUILTIN_WORKFLOWS_DIR, "conversation.json");
    fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2));
    console.error("[WorkflowStorage] Created conversation workflow");
  }
}
