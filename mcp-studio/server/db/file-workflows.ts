/**
 * File-based Workflows Loader
 *
 * Loads workflow JSON files from directories specified in WORKFLOWS_DIRS env var.
 * These workflows are read-only and can be duplicated to PostgreSQL.
 *
 * Features:
 * - Supports multiple directories (comma-separated)
 * - Supports ~ for home directory expansion
 * - Watches for file changes (optional, for dev mode)
 * - Caches workflows in memory with TTL
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { Workflow } from "@decocms/bindings/workflow";

// ============================================================================
// Types
// ============================================================================

export interface FileWorkflow extends Workflow {
  /** Mark as read-only (comes from file, not DB) */
  readonly: true;
  /** Source file path */
  source_file: string;
  /** Source directory */
  source_dir: string;
}

interface CacheEntry {
  workflows: FileWorkflow[];
  loadedAt: number;
}

// ============================================================================
// Configuration
// ============================================================================

const CACHE_TTL_MS = 60 * 1000; // 1 minute cache

let cache: CacheEntry | null = null;

// ============================================================================
// Path Helpers
// ============================================================================

function expandPath(p: string): string {
  if (p.startsWith("~/")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

function getWorkflowDirs(): string[] {
  const envVar = process.env.WORKFLOWS_DIRS;
  if (!envVar) return [];

  return envVar
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean)
    .map(expandPath);
}

// ============================================================================
// File Loading
// ============================================================================

function loadWorkflowFromFile(
  filePath: string,
  sourceDir: string,
): FileWorkflow | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);

    // Validate basic structure
    if (!parsed.id || !parsed.title) {
      console.error(
        `[file-workflows] Invalid workflow (missing id or title): ${filePath}`,
      );
      return null;
    }

    // Ensure steps array exists
    if (!Array.isArray(parsed.steps)) {
      parsed.steps = [];
    }

    return {
      ...parsed,
      readonly: true,
      source_file: filePath,
      source_dir: sourceDir,
      // Ensure dates exist
      created_at: parsed.created_at || new Date().toISOString(),
      updated_at: parsed.updated_at || new Date().toISOString(),
    } as FileWorkflow;
  } catch (error) {
    console.error(`[file-workflows] Error loading ${filePath}:`, error);
    return null;
  }
}

function loadWorkflowsFromDir(dir: string): FileWorkflow[] {
  const workflows: FileWorkflow[] = [];

  if (!fs.existsSync(dir)) {
    console.warn(`[file-workflows] Directory not found: ${dir}`);
    return workflows;
  }

  try {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      if (!file.endsWith(".json")) continue;

      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (!stat.isFile()) continue;

      const workflow = loadWorkflowFromFile(filePath, dir);
      if (workflow) {
        workflows.push(workflow);
      }
    }
  } catch (error) {
    console.error(`[file-workflows] Error reading directory ${dir}:`, error);
  }

  return workflows;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get all file-based workflows.
 * Uses caching with TTL for performance.
 */
export function getFileWorkflows(forceRefresh = false): FileWorkflow[] {
  const now = Date.now();

  // Return cached if valid
  if (cache && !forceRefresh && now - cache.loadedAt < CACHE_TTL_MS) {
    return cache.workflows;
  }

  // Load from all directories
  const dirs = getWorkflowDirs();
  const workflows: FileWorkflow[] = [];

  for (const dir of dirs) {
    const dirWorkflows = loadWorkflowsFromDir(dir);
    workflows.push(...dirWorkflows);
  }

  // Deduplicate by ID (first one wins)
  const seen = new Set<string>();
  const deduped = workflows.filter((w) => {
    if (seen.has(w.id)) {
      console.warn(
        `[file-workflows] Duplicate workflow ID "${w.id}" found, using first occurrence`,
      );
      return false;
    }
    seen.add(w.id);
    return true;
  });

  // Update cache
  cache = {
    workflows: deduped,
    loadedAt: now,
  };

  if (deduped.length > 0) {
    console.error(
      `[file-workflows] Loaded ${deduped.length} workflows from ${dirs.length} directories`,
    );
  }

  return deduped;
}

/**
 * Get a specific file-based workflow by ID.
 */
export function getFileWorkflow(id: string): FileWorkflow | null {
  const workflows = getFileWorkflows();
  return workflows.find((w) => w.id === id) || null;
}

/**
 * Check if a workflow ID exists in file-based workflows.
 */
export function isFileWorkflow(id: string): boolean {
  return getFileWorkflow(id) !== null;
}

/**
 * Clear the cache (for testing or hot-reload scenarios).
 */
export function clearFileWorkflowsCache(): void {
  cache = null;
}

/**
 * Initialize and log status.
 */
export function initFileWorkflows(): void {
  const dirs = getWorkflowDirs();

  if (dirs.length === 0) {
    console.error(
      "[file-workflows] No WORKFLOWS_DIRS configured - only PostgreSQL workflows available",
    );
    return;
  }

  console.error(`[file-workflows] Configured directories: ${dirs.join(", ")}`);

  // Pre-load to validate
  const workflows = getFileWorkflows(true);
  console.error(
    `[file-workflows] Loaded ${workflows.length} file-based workflows`,
  );
}
