/**
 * Skill Management Tools
 *
 * Tools for listing, viewing, and applying skills to create tasks.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../shared/deco.gen.ts";
import { getSkill, listSkills, type UserStory } from "../skills/index.ts";
import { getWorkspace } from "./workspace.ts";

// ============================================================================
// Schemas
// ============================================================================

const UserStorySchema = z.object({
  id: z.string(),
  title: z.string(),
  asA: z.string(),
  iWant: z.string(),
  soThat: z.string(),
  acceptanceCriteria: z.array(z.string()),
  dependsOn: z.array(z.string()).optional(),
});

const SkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  stack: z.array(z.string()),
  userStories: z.array(UserStorySchema),
  qualityGates: z.record(z.string(), z.array(z.string())),
});

// ============================================================================
// Helper: Run bd create
// ============================================================================

async function createBeadTask(story: UserStory, cwd: string): Promise<string> {
  const description = [
    `As a ${story.asA}, I want ${story.iWant}, so that ${story.soThat}`,
    "",
    "## Acceptance Criteria",
    ...story.acceptanceCriteria.map((ac) => `- [ ] ${ac}`),
  ].join("\n");

  const args = ["create", story.title, "--json"];
  args.push("-d", description);
  args.push("-t", "task");

  if (story.dependsOn?.length) {
    args.push("--blocked-by", story.dependsOn.join(","));
  }

  const proc = Bun.spawn(["bd", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`Failed to create task: ${story.title}`);
  }

  try {
    const result = JSON.parse(stdout);
    return result.id ?? story.id;
  } catch {
    // Try to extract ID from output
    const match = stdout.match(/bd-[\w.]+/);
    return match?.[0] ?? story.id;
  }
}

// ============================================================================
// SKILL_LIST
// ============================================================================

export const createSkillListTool = (_env: Env) =>
  createPrivateTool({
    id: "SKILL_LIST",
    description:
      "List all available skills. Skills define reusable workflows for common development tasks.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      skills: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          description: z.string(),
          stack: z.array(z.string()),
          storyCount: z.number(),
        }),
      ),
    }),
    execute: async () => {
      const allSkills = listSkills();

      return {
        skills: allSkills.map((skill) => ({
          id: skill.id,
          name: skill.name,
          description: skill.description,
          stack: skill.stack,
          storyCount: skill.userStories.length,
        })),
      };
    },
  });

// ============================================================================
// SKILL_SHOW
// ============================================================================

export const createSkillShowTool = (_env: Env) =>
  createPrivateTool({
    id: "SKILL_SHOW",
    description:
      "Show details of a specific skill, including user stories and quality gates.",
    inputSchema: z.object({
      skillId: z.string().describe("Skill ID to show (e.g., 'build-mcp')"),
    }),
    outputSchema: z.object({
      skill: SkillSchema.nullable(),
    }),
    execute: async ({ context }) => {
      const skill = getSkill(context.skillId);

      if (!skill) {
        return { skill: null };
      }

      return { skill };
    },
  });

// ============================================================================
// SKILL_APPLY
// ============================================================================

export const createSkillApplyTool = (_env: Env) =>
  createPrivateTool({
    id: "SKILL_APPLY",
    description:
      "Apply a skill to the current workspace. Creates Beads tasks for each user story in the skill.",
    inputSchema: z.object({
      skillId: z.string().describe("Skill ID to apply"),
      customization: z
        .object({
          prefix: z.string().optional().describe("Custom task ID prefix"),
          extraContext: z
            .string()
            .optional()
            .describe("Additional context to add to tasks"),
        })
        .optional(),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      tasksCreated: z.array(z.string()),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const workspace = getWorkspace();
      const skill = getSkill(context.skillId);

      if (!skill) {
        throw new Error(`Skill not found: ${context.skillId}`);
      }

      // Map story IDs to Beads task IDs
      const idMap: Record<string, string> = {};
      const createdTasks: string[] = [];

      // Create tasks in order (respecting dependencies)
      for (const story of skill.userStories) {
        // Remap dependencies to Beads IDs
        const remappedStory: UserStory = {
          ...story,
          dependsOn: story.dependsOn?.map((dep) => idMap[dep]).filter(Boolean),
        };

        const taskId = await createBeadTask(remappedStory, workspace);
        idMap[story.id] = taskId;
        createdTasks.push(taskId);
      }

      return {
        success: true,
        tasksCreated: createdTasks,
        message: `Applied skill '${skill.name}': created ${createdTasks.length} tasks`,
      };
    },
  });

// ============================================================================
// Export all skill tools
// ============================================================================

export const skillTools = [
  createSkillListTool,
  createSkillShowTool,
  createSkillApplyTool,
];
