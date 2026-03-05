/**
 * Skills Tools
 *
 * Tools to expose skills/guides for weekly digest article creation.
 */

import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/tools";
import type { Env } from "../types/env.ts";
import { BLOG_POSTS_SKILL } from "../skills/blog-posts.ts";

/**
 * GET_BLOG_POST_SKILL - Returns the complete guide for writing weekly digest articles
 */
export const getBlogPostSkillTool = (_env: Env) =>
  createPrivateTool({
    id: "GET_BLOG_POST_SKILL",
    description:
      "Returns the complete guide for creating weekly digest articles for decoNews. " +
      "Use this skill to understand the database schema, content format (HTML), " +
      "digest structure, MCP tools usage, and workflow for weekly digests. " +
      "Includes: schema reference, HTML format, structure patterns, tool examples, and common mistakes.",
    inputSchema: z.object({
      section: z
        .enum([
          "all",
          "schema",
          "format",
          "structure",
          "tools",
          "workflow",
          "images",
          "mistakes",
        ])
        .default("all")
        .describe(
          "Which section of the skill to return. 'all' returns the complete guide.",
        ),
    }),
    outputSchema: z.object({
      skill: z
        .string()
        .describe("The weekly digest writing skill/guide content"),
      section: z.string().describe("The section that was returned"),
    }),
    execute: async ({ context }) => {
      const { section } = context;

      if (section === "all") {
        return {
          skill: BLOG_POSTS_SKILL,
          section: "all",
        };
      }

      // Extract specific sections based on request
      const sections: Record<string, { start: string; end: string }> = {
        schema: {
          start: "## Article Database Schema",
          end: "## Content Format",
        },
        format: {
          start: "## Content Format",
          end: "## Weekly Digest Structure",
        },
        structure: {
          start: "## Weekly Digest Structure",
          end: "## Using the MCP Tools",
        },
        tools: {
          start: "## Using the MCP Tools",
          end: "## Weekly Digest Workflow",
        },
        workflow: {
          start: "## Weekly Digest Workflow",
          end: "## Tone & Voice Guidelines",
        },
        images: {
          start: "## Image Generation",
          end: "## Common Mistakes",
        },
        mistakes: {
          start: "## Common Mistakes",
          end: "## Author Default",
        },
      };

      const sectionConfig = sections[section];
      if (!sectionConfig) {
        return {
          skill: BLOG_POSTS_SKILL,
          section: "all",
        };
      }

      const startIndex = BLOG_POSTS_SKILL.indexOf(sectionConfig.start);
      let endIndex = BLOG_POSTS_SKILL.indexOf(sectionConfig.end);

      if (startIndex === -1) {
        return {
          skill: BLOG_POSTS_SKILL,
          section: "all (section not found, returning complete guide)",
        };
      }

      if (endIndex === -1) {
        endIndex = BLOG_POSTS_SKILL.length;
      }

      const extractedSection = BLOG_POSTS_SKILL.slice(
        startIndex,
        endIndex,
      ).trim();

      return {
        skill: extractedSection,
        section,
      };
    },
  });

/**
 * Export all skills tools
 */
export const skillsTools = [getBlogPostSkillTool];
