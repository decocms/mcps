/**
 * Workspace Management Tools
 *
 * Tools for setting and getting the current workspace directory
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../shared/deco.gen.ts";

// In-memory workspace state (per connection in production)
let currentWorkspace: string | null = null;

/**
 * Get current workspace, throws if not set
 */
export function getWorkspace(): string {
  if (!currentWorkspace) {
    throw new Error(
      "Workspace not set. Use WORKSPACE_SET to set a workspace directory first.",
    );
  }
  return currentWorkspace;
}

/**
 * Set the current workspace
 */
export function setWorkspace(dir: string): void {
  currentWorkspace = dir;
}

// ============================================================================
// WORKSPACE_SET
// ============================================================================

export const createWorkspaceSetTool = (_env: Env) =>
  createPrivateTool({
    id: "WORKSPACE_SET",
    description:
      "Set the working directory for all Task Runner operations. This is where Beads will look for .beads/ and where agents will make changes.",
    inputSchema: z.object({
      directory: z
        .string()
        .describe("Absolute path to the workspace directory"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      workspace: z.string().describe("The workspace that was set"),
      hasBeads: z.boolean().describe("Whether .beads/ directory exists"),
    }),
    execute: async ({ context }) => {
      const { directory } = context;

      // Check if directory exists
      const file = Bun.file(directory);
      const stat = await file.exists();

      if (!stat) {
        throw new Error(`Directory does not exist: ${directory}`);
      }

      // Set the workspace
      setWorkspace(directory);

      // Check if .beads/ exists
      const beadsDir = `${directory}/.beads`;
      const beadsFile = Bun.file(beadsDir);
      const hasBeads = await beadsFile.exists();

      return {
        success: true,
        workspace: directory,
        hasBeads,
      };
    },
  });

// ============================================================================
// WORKSPACE_GET
// ============================================================================

export const createWorkspaceGetTool = (_env: Env) =>
  createPrivateTool({
    id: "WORKSPACE_GET",
    description: "Get the current workspace directory.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      workspace: z
        .string()
        .nullable()
        .describe("Current workspace, or null if not set"),
      hasBeads: z
        .boolean()
        .nullable()
        .describe("Whether .beads/ directory exists"),
    }),
    execute: async () => {
      if (!currentWorkspace) {
        return {
          workspace: null,
          hasBeads: null,
        };
      }

      // Check if .beads/ exists
      const beadsDir = `${currentWorkspace}/.beads`;
      const beadsFile = Bun.file(beadsDir);
      const hasBeads = await beadsFile.exists();

      return {
        workspace: currentWorkspace,
        hasBeads,
      };
    },
  });

// ============================================================================
// Export all workspace tools
// ============================================================================

// Note: WORKSPACE_SET and WORKSPACE_GET are NOT exposed to agents.
// The workspace is passed directly to tools like AGENT_SPAWN.
// The tool creators are already exported above for debugging/admin use.
export const workspaceTools: ((
  env: Env,
) => ReturnType<typeof createWorkspaceSetTool>)[] = [];
