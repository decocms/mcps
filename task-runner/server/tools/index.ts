/**
 * Central export point for all Task Runner tools
 *
 * Tools:
 * - workspaceTools: Workspace management
 * - beadsTools: Beads CLI integration (bd commands)
 * - loopTools: Ralph-style execution loop
 * - skillTools: Skill management (list, show, apply)
 * - agentTools: Agent spawning and control (Claude Code)
 * - memoryTools: Project memory (daily logs + long-term memory)
 */

import { workspaceTools } from "./workspace.ts";
import { beadsTools } from "./beads.ts";
import { loopTools } from "./loop.ts";
import { skillTools } from "./skills.ts";
import { agentTools } from "./agent.ts";
import { memoryTools } from "./memory.ts";

// Export all tools from all modules
export const tools = [
  ...workspaceTools,
  ...beadsTools,
  ...loopTools,
  ...skillTools,
  ...agentTools,
  ...memoryTools,
];
