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
function createMultiStepWorkflow(): Workflow {
  return {
    id: "execute-multi-step",
    title: "Execute Multi-Step Task",
    description:
      "Two-phase workflow for complex tasks: FAST plans, SMART executes",
    steps: [
      {
        name: "plan",
        description: "Analyze and plan the approach",
        action: {
          type: "llm",
          prompt: "@input.message",
          model: "fast",
          systemPrompt: `You are PILOT PLANNER. Analyze the task and create an execution plan.

## YOUR JOB
1. Understand what the user wants
2. Discover available tools
3. Create a clear plan for the executor

## DISCOVERY TOOLS
- list_mesh_tools() - List API tools
- list_local_tools() - List file/shell tools
- LIST_FILES - Browse directories

## OUTPUT
After discovering tools, output:
{
  "response": "I'll [brief plan]",
  "taskForExecutor": "Detailed step-by-step instructions",
  "toolsForExecutor": ["TOOL1", "TOOL2"]
}`,
          tools: "discover",
          maxIterations: 10,
        },
        input: {
          message: "@input.message",
        },
      },
      {
        name: "execute",
        description: "Execute the plan",
        action: {
          type: "llm",
          prompt: "@plan.taskForExecutor",
          model: "smart",
          systemPrompt: `You are PILOT EXECUTOR. Complete the task step-by-step.

RULES:
1. Follow the plan from planning step
2. Use function calling for ALL tools
3. Complete the ENTIRE task
4. Summarize what you accomplished`,
          tools: "@plan.toolsForExecutor",
          maxIterations: 50,
        },
        input: {
          task: "@plan.taskForExecutor",
          tools: "@plan.toolsForExecutor",
        },
        config: {
          skipIf: "empty:@plan.toolsForExecutor",
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

  // Create fast-router (new default) if it doesn't exist
  if (!workflowExists("fast-router")) {
    const fastRouter = {
      id: "fast-router",
      title: "Fast Router",
      description:
        "Routes messages to direct response, tool call, or workflow. Task-aware orchestrator.",
      steps: [
        {
          name: "route",
          description: "Analyze request and route to appropriate handler",
          action: {
            type: "llm",
            prompt: "@input.message",
            model: "fast",
            systemPrompt: `You are PILOT, a fast task router and orchestrator.

## TOOLS AVAILABLE
You have access to all mesh tools. Call any tool directly to perform actions.

## TASK MANAGEMENT
- start_task(workflowId, input) - Start a workflow as a background task
- check_task(taskId) - Check task status/progress
- list_tasks(status?) - List all tasks
- delete_task(taskId) - Remove a task

## DECISION FLOW
1. Simple query → respond directly
2. Single tool needed → call it, return result
3. Multi-step task → start_task("workflow-id", input)

## AVAILABLE WORKFLOWS
- execute-multi-step: Complex tasks needing multiple steps
- quick-draft: Quick article draft
- create-article: Full article creation workflow

Always respond naturally. If starting a task, mention the ID.`,
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
    const filePath = path.join(BUILTIN_WORKFLOWS_DIR, "fast-router.json");
    fs.writeFileSync(filePath, JSON.stringify(fastRouter, null, 2));
    console.error("[WorkflowStorage] Created fast-router workflow");
  }

  // Create execute-multi-step if it doesn't exist
  if (!workflowExists("execute-multi-step")) {
    const filePath = path.join(
      BUILTIN_WORKFLOWS_DIR,
      "execute-multi-step.json",
    );
    fs.writeFileSync(
      filePath,
      JSON.stringify(createMultiStepWorkflow(), null, 2),
    );
    console.error("[WorkflowStorage] Created execute-multi-step workflow");
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
}
