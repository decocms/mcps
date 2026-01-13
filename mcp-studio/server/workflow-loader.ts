/**
 * Filesystem Workflow Loader
 *
 * Loads workflow definitions from JSON files on the filesystem.
 * This enables:
 * - Version-controlled workflows (store in git)
 * - MCP packaging (MCPs can ship workflows)
 * - Local development (edit files, hot-reload)
 * - Database-free operation (no PostgreSQL required)
 *
 * Environment variables:
 * - WORKFLOW_DIR: Directory to scan for *.workflow.json or *.json files
 * - WORKFLOW_FILES: Comma-separated list of specific workflow files
 *
 * File formats supported:
 * - Single workflow: { "id": "...", "title": "...", "steps": [...] }
 * - Multiple workflows: { "workflows": [...] }
 *
 * Example directory structure:
 *   workflows/
 *   ├── enrich-contact.workflow.json
 *   ├── notify-team.workflow.json
 *   └── my-mcp/
 *       └── bundled-workflows.json  (can contain multiple)
 */

import { readdir, readFile, stat, watch } from "node:fs/promises";
import { join, extname, basename, dirname } from "node:path";
import { WorkflowSchema, type Workflow } from "@decocms/bindings/workflow";

export interface LoadedWorkflow extends Workflow {
  /** Source file path */
  _sourceFile: string;
  /** Whether this is a filesystem workflow (vs database) */
  _isFilesystem: true;
}

export interface WorkflowLoaderOptions {
  /** Directory to scan for workflow files */
  workflowDir?: string;
  /** Specific workflow files to load */
  workflowFiles?: string[];
  /** Enable file watching for hot reload */
  watch?: boolean;
  /** Callback when workflows change */
  onChange?: (workflows: LoadedWorkflow[]) => void;
}

/**
 * In-memory cache of loaded workflows
 */
let cachedWorkflows: LoadedWorkflow[] = [];
let watchAbortController: AbortController | null = null;

/**
 * Get the configured workflow source from environment
 */
export function getWorkflowSource(): WorkflowLoaderOptions {
  const options: WorkflowLoaderOptions = {};

  if (process.env.WORKFLOW_DIR) {
    options.workflowDir = process.env.WORKFLOW_DIR;
  }

  if (process.env.WORKFLOW_FILES) {
    options.workflowFiles = process.env.WORKFLOW_FILES.split(",").map((f) =>
      f.trim(),
    );
  }

  return options;
}

/**
 * Check if filesystem workflow loading is enabled
 */
export function isFilesystemMode(): boolean {
  const source = getWorkflowSource();
  return !!(source.workflowDir || source.workflowFiles?.length);
}

/**
 * Parse a workflow file and extract workflow(s)
 */
async function parseWorkflowFile(filePath: string): Promise<LoadedWorkflow[]> {
  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch (error) {
    // Handle file access errors (deleted, permission denied, etc.) gracefully
    console.error(`[workflow-loader] Failed to read ${filePath}:`, error);
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch (error) {
    console.error(`[workflow-loader] Failed to parse ${filePath}:`, error);
    return [];
  }

  const workflows: LoadedWorkflow[] = [];

  // Handle array of workflows
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const validated = validateWorkflow(item, filePath);
      if (validated) workflows.push(validated);
    }
    return workflows;
  }

  // Handle object with "workflows" key
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "workflows" in parsed &&
    Array.isArray((parsed as { workflows: unknown }).workflows)
  ) {
    for (const item of (parsed as { workflows: unknown[] }).workflows) {
      const validated = validateWorkflow(item, filePath);
      if (validated) workflows.push(validated);
    }
    return workflows;
  }

  // Handle single workflow
  const validated = validateWorkflow(parsed, filePath);
  if (validated) workflows.push(validated);

  return workflows;
}

/**
 * Validate a workflow object against the schema
 */
function validateWorkflow(
  data: unknown,
  sourceFile: string,
): LoadedWorkflow | null {
  const result = WorkflowSchema.safeParse(data);

  if (!result.success) {
    console.error(
      `[workflow-loader] Invalid workflow in ${sourceFile}:`,
      result.error.format(),
    );
    return null;
  }

  // Generate ID from filename if not present
  let id = result.data.id;
  if (!id) {
    const base = basename(sourceFile, extname(sourceFile));
    // Remove .workflow suffix if present
    id = base.replace(/\.workflow$/, "");
  }

  return {
    ...result.data,
    id,
    _sourceFile: sourceFile,
    _isFilesystem: true,
  };
}

/**
 * Scan a directory for workflow files
 */
async function scanDirectory(dir: string): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await readdir(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stats = await stat(fullPath);

      if (stats.isDirectory()) {
        // Recursively scan subdirectories
        const subFiles = await scanDirectory(fullPath);
        files.push(...subFiles);
      } else if (stats.isFile()) {
        // Include .json and .workflow.json files
        if (entry.endsWith(".json")) {
          files.push(fullPath);
        }
      }
    }
  } catch (error) {
    console.error(`[workflow-loader] Failed to scan ${dir}:`, error);
  }

  return files;
}

/**
 * Load all workflows from configured sources
 */
export async function loadWorkflows(
  options?: WorkflowLoaderOptions,
): Promise<LoadedWorkflow[]> {
  const source = options || getWorkflowSource();
  const allWorkflows: LoadedWorkflow[] = [];
  const filesToLoad: string[] = [];

  // Collect files from directory
  if (source.workflowDir) {
    const dirFiles = await scanDirectory(source.workflowDir);
    filesToLoad.push(...dirFiles);
    console.error(
      `[workflow-loader] Found ${dirFiles.length} files in ${source.workflowDir}`,
    );
  }

  // Add explicitly specified files
  if (source.workflowFiles) {
    filesToLoad.push(...source.workflowFiles);
  }

  // Load each file
  for (const file of filesToLoad) {
    const workflows = await parseWorkflowFile(file);
    allWorkflows.push(...workflows);
  }

  // Cache the results
  cachedWorkflows = allWorkflows;

  console.error(
    `[workflow-loader] Loaded ${allWorkflows.length} workflow(s) from filesystem`,
  );

  // Log workflow IDs for debugging
  if (allWorkflows.length > 0) {
    console.error(
      `[workflow-loader] Workflows: ${allWorkflows.map((w) => w.id).join(", ")}`,
    );
  }

  return allWorkflows;
}

/**
 * Get cached workflows (call loadWorkflows first)
 */
export function getCachedWorkflows(): LoadedWorkflow[] {
  return cachedWorkflows;
}

/**
 * Get a specific workflow by ID
 */
export function getWorkflowById(id: string): LoadedWorkflow | undefined {
  return cachedWorkflows.find((w) => w.id === id);
}

/**
 * Start watching for file changes
 */
export async function startWatching(
  options?: WorkflowLoaderOptions,
): Promise<void> {
  const source = options || getWorkflowSource();

  // Stop any existing watcher
  stopWatching();

  watchAbortController = new AbortController();

  if (source.workflowDir) {
    console.error(
      `[workflow-loader] Watching ${source.workflowDir} for changes`,
    );

    try {
      const watcher = watch(source.workflowDir, {
        recursive: true,
        signal: watchAbortController.signal,
      });

      (async () => {
        try {
          for await (const event of watcher) {
            if (event.filename?.endsWith(".json")) {
              console.error(
                `[workflow-loader] File changed: ${event.filename}`,
              );
              await loadWorkflows(options);
              options.onChange?.(cachedWorkflows);
            }
          }
        } catch (error) {
          if ((error as { name?: string }).name !== "AbortError") {
            console.error("[workflow-loader] Watch error:", error);
          }
        }
      })();
    } catch (error) {
      console.error("[workflow-loader] Failed to start watcher:", error);
    }
  }
}

/**
 * Stop watching for file changes
 */
export function stopWatching(): void {
  if (watchAbortController) {
    watchAbortController.abort();
    watchAbortController = null;
  }
}

/**
 * Reload workflows from disk
 */
export async function reloadWorkflows(): Promise<LoadedWorkflow[]> {
  return loadWorkflows(getWorkflowSource());
}
