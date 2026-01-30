/**
 * Skills tools - List and get skill content
 */
import { createTool } from "@decocms/runtime/mastra";
import { z } from "zod";
import { SKILLS } from "../skills/data.ts";
import type { Env } from "../main.ts";

/**
 * List all available skills
 */
export const createListSkillsTool = (env: Env) =>
  createTool({
    id: "LIST_SKILLS",
    description:
      "List all available deco skills. Returns skill IDs, names, descriptions, and whether they are enabled.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      skills: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          description: z.string(),
          enabled: z.boolean(),
          referenceCount: z.number(),
        }),
      ),
      enabledCount: z.number(),
      totalCount: z.number(),
    }),
    execute: async () => {
      const enabledSkills = env.STATE?.enabledSkills ?? [];

      const skills = Object.values(SKILLS).map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        enabled: enabledSkills.includes(skill.id),
        referenceCount: skill.references.length,
      }));

      return {
        skills,
        enabledCount: skills.filter((s) => s.enabled).length,
        totalCount: skills.length,
      };
    },
  });

/**
 * Get full content of a skill
 */
export const createGetSkillTool = (env: Env) =>
  createTool({
    id: "GET_SKILL",
    description:
      "Get the full content of a deco skill including main content and references.",
    inputSchema: z.object({
      skillId: z
        .string()
        .describe("Skill ID (e.g., 'decocms-marketing-pages')"),
      includeReferences: z.boolean().optional().default(true),
    }),
    outputSchema: z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      enabled: z.boolean(),
      mainContent: z.string(),
      references: z
        .array(
          z.object({
            name: z.string(),
            path: z.string(),
            content: z.string(),
          }),
        )
        .optional(),
    }),
    execute: async ({ context }) => {
      const { skillId, includeReferences } = context;
      const skill = SKILLS[skillId];
      if (!skill) {
        throw new Error(
          `Skill '${skillId}' not found. Use LIST_SKILLS to see available skills.`,
        );
      }

      const enabledSkills = env.STATE?.enabledSkills ?? [];
      const isEnabled = enabledSkills.includes(skill.id);

      if (!isEnabled) {
        throw new Error(
          `Skill '${skillId}' is not enabled. Enable it in MCP configuration.`,
        );
      }

      return {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        enabled: isEnabled,
        mainContent: skill.mainContent,
        references: includeReferences ? skill.references : undefined,
      };
    },
  });

/**
 * Get a specific reference from a skill
 */
export const createGetSkillReferenceTool = (env: Env) =>
  createTool({
    id: "GET_SKILL_REFERENCE",
    description:
      "Get a specific reference document from a skill (e.g., 'color-tokens', 'ai-slop-list').",
    inputSchema: z.object({
      skillId: z.string(),
      referenceName: z.string(),
    }),
    outputSchema: z.object({
      skillId: z.string(),
      referenceName: z.string(),
      path: z.string(),
      content: z.string(),
    }),
    execute: async ({ context }) => {
      const { skillId, referenceName } = context;
      const skill = SKILLS[skillId];
      if (!skill) {
        throw new Error(`Skill '${skillId}' not found.`);
      }

      const enabledSkills = env.STATE?.enabledSkills ?? [];
      if (!enabledSkills.includes(skill.id)) {
        throw new Error(`Skill '${skillId}' is not enabled.`);
      }

      const reference = skill.references.find((r) => r.name === referenceName);
      if (!reference) {
        const available = skill.references.map((r) => r.name).join(", ");
        throw new Error(
          `Reference '${referenceName}' not found. Available: ${available}`,
        );
      }

      return {
        skillId: skill.id,
        referenceName: reference.name,
        path: reference.path,
        content: reference.content,
      };
    },
  });

/**
 * Search across all enabled skills
 */
export const createSearchSkillsTool = (env: Env) =>
  createTool({
    id: "SEARCH_SKILLS",
    description: "Search across all enabled skills for specific content.",
    inputSchema: z.object({
      query: z
        .string()
        .describe("Search query (e.g., 'Track 1', 'color tokens', 'AI slop')"),
    }),
    outputSchema: z.object({
      results: z.array(
        z.object({
          skillId: z.string(),
          skillName: z.string(),
          matchType: z.enum(["main", "reference"]),
          referenceName: z.string().optional(),
          snippet: z.string(),
        }),
      ),
      totalMatches: z.number(),
    }),
    execute: async ({ context }) => {
      const { query } = context;
      const enabledSkills = env.STATE?.enabledSkills ?? [];
      const queryLower = query.toLowerCase();
      const results: Array<{
        skillId: string;
        skillName: string;
        matchType: "main" | "reference";
        referenceName?: string;
        snippet: string;
      }> = [];

      for (const skill of Object.values(SKILLS)) {
        if (!enabledSkills.includes(skill.id)) continue;

        if (skill.mainContent.toLowerCase().includes(queryLower)) {
          results.push({
            skillId: skill.id,
            skillName: skill.name,
            matchType: "main",
            snippet: extractSnippet(skill.mainContent, queryLower),
          });
        }

        for (const ref of skill.references) {
          if (ref.content.toLowerCase().includes(queryLower)) {
            results.push({
              skillId: skill.id,
              skillName: skill.name,
              matchType: "reference",
              referenceName: ref.name,
              snippet: extractSnippet(ref.content, queryLower),
            });
          }
        }
      }

      return { results, totalMatches: results.length };
    },
  });

function extractSnippet(content: string, query: string): string {
  const index = content.toLowerCase().indexOf(query);
  if (index === -1) return "";
  const start = Math.max(0, index - 80);
  const end = Math.min(content.length, index + query.length + 80);
  let snippet = content.slice(start, end);
  if (start > 0) snippet = "..." + snippet;
  if (end < content.length) snippet = snippet + "...";
  return snippet.replace(/\n+/g, " ").trim();
}

export const skillTools = [
  createListSkillsTool,
  createGetSkillTool,
  createGetSkillReferenceTool,
  createSearchSkillsTool,
];
