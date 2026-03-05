/**
 * Central export point for all tools.
 */
import { weeklyDigestTools } from "./weekly-digest.ts";
import { skillsTools } from "./skills.ts";

// Export all tools
export const tools = [...weeklyDigestTools, ...skillsTools];

// Re-export domain-specific tools for direct access if needed
export { weeklyDigestTools } from "./weekly-digest.ts";
export { skillsTools } from "./skills.ts";
