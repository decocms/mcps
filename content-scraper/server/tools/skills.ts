/**
 * Skills Tools
 *
 * Tools to access documentation skills for LLMs.
 */

import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/tools";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Get the directory of this file to build paths to skills
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to skills folder (relative to this file: ../../../skills)
const SKILLS_DIR = join(__dirname, "..", "..", "skills");

/**
 * Available skills registry
 */
const SKILLS_REGISTRY = [
  {
    id: "weekly-report-publishing",
    name: "Weekly Report Publishing",
    description:
      "Teaches how to publish weekly digest reports to the deco_weekly_report database table. Includes schema, SQL examples, URL patterns, and best practices.",
    filename: "weekly-report-publishing/SKILL.md",
    tool_to_access: "GET_WEEKLY_REPORT_PUBLISHING_SKILL",
  },
] as const;

/**
 * Read a skill file from disk
 */
async function readSkillFile(filename: string): Promise<string> {
  const filepath = join(SKILLS_DIR, filename);
  return await readFile(filepath, "utf-8");
}

// =============================================================================
// GET_WEEKLY_REPORT_PUBLISHING_SKILL Tool
// =============================================================================

export const getWeeklyReportPublishingSkillTool = createPrivateTool({
  id: "GET_WEEKLY_REPORT_PUBLISHING_SKILL",
  description:
    "Returns the Weekly Report Publishing skill documentation. This skill teaches how to publish weekly digest reports to the deco_weekly_report database table, including schema, SQL examples, and best practices.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    skill: z.string().describe("The complete skill documentation in Markdown"),
    skill_name: z.string().describe("Name of the skill"),
    summary: z.string().describe("Brief summary of what the skill teaches"),
    error: z.string().optional(),
  }),
  execute: async () => {
    try {
      const skillContent = await readSkillFile(
        "weekly-report-publishing/SKILL.md",
      );

      return {
        success: true,
        skill: skillContent,
        skill_name: "Weekly Report Publishing",
        summary:
          "This skill teaches how to publish Weekly Digest reports to the deco_weekly_report database table. It includes the complete table schema, required and recommended fields, SQL INSERT/UPDATE examples, URL and slug patterns, special character handling, and a publishing checklist.",
      };
    } catch (error) {
      return {
        success: false,
        skill: "",
        skill_name: "Weekly Report Publishing",
        summary: "",
        error: `Failed to read skill file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

// =============================================================================
// LIST_AVAILABLE_SKILLS Tool
// =============================================================================

export const listAvailableSkillsTool = createPrivateTool({
  id: "LIST_AVAILABLE_SKILLS",
  description:
    "Lists all available skills/documentation that can be retrieved.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    skills: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        tool_to_access: z.string(),
      }),
    ),
  }),
  execute: async () => {
    return {
      success: true,
      skills: SKILLS_REGISTRY.map(
        ({ id, name, description, tool_to_access }) => ({
          id,
          name,
          description,
          tool_to_access,
        }),
      ),
    };
  },
});

/**
 * Export all skills tools
 */
export const skillsTools = [
  getWeeklyReportPublishingSkillTool,
  listAvailableSkillsTool,
];
