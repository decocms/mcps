/**
 * Agent MCP Tools
 *
 * CRUD operations for Discord agent configurations via MCP.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { runSQL } from "../db/postgres.ts";
import type { Env } from "../types/env.ts";

// ============================================================================
// Schemas
// ============================================================================

const AgentConfigSchema = z
  .object({
    id: z.string(),
    guild_id: z.string(),
    name: z.string(),
    command: z.string(),
    description: z.string().nullable(),
    avatar_url: z.string().nullable(),
    color: z.string().nullable(),
    agent_binding_id: z.string(),
    model_id: z.string().nullable(),
    system_prompt: z.string().nullable(),
    context_messages: z.number(),
    max_tokens: z.number().nullable(),
    temperature: z.number().nullable(),
    enabled: z.boolean(),
    created_at: z.string(),
    updated_at: z.string(),
    created_by: z.string(),
  })
  .strict();

type AgentConfig = z.infer<typeof AgentConfigSchema>;

// ============================================================================
// Tools
// ============================================================================

/**
 * List all agents for a guild
 */
export const createAgentListTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_AGENT_LIST",
    description: "List all configured AI agents for a Discord server",
    inputSchema: z
      .object({
        guild_id: z.string().describe("Discord server/guild ID"),
        enabled_only: z
          .boolean()
          .default(false)
          .describe("Only return enabled agents"),
      })
      .strict(),
    outputSchema: z
      .object({
        agents: z.array(AgentConfigSchema),
        total: z.number(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const { guild_id, enabled_only } = context as {
        guild_id: string;
        enabled_only: boolean;
      };

      let sql = `SELECT * FROM discord_agent_config WHERE guild_id = $1`;
      const params: unknown[] = [guild_id];

      if (enabled_only) {
        sql += ` AND enabled = true`;
      }

      sql += ` ORDER BY created_at DESC`;

      const agents = await runSQL<AgentConfig>(env, sql, params);

      return {
        agents,
        total: agents.length,
      };
    },
  });

/**
 * Get a specific agent by command
 */
export const createAgentGetTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_AGENT_GET",
    description: "Get details of a specific AI agent by command name",
    inputSchema: z
      .object({
        guild_id: z.string().describe("Discord server/guild ID"),
        command: z.string().describe("Agent command name"),
      })
      .strict(),
    outputSchema: z
      .object({
        agent: AgentConfigSchema.nullable(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const { guild_id, command } = context as {
        guild_id: string;
        command: string;
      };

      const agents = await runSQL<AgentConfig>(
        env,
        `SELECT * FROM discord_agent_config WHERE guild_id = $1 AND command = $2 LIMIT 1`,
        [guild_id, command],
      );

      return { agent: agents[0] || null };
    },
  });

/**
 * Create a new agent
 */
export const createAgentCreateTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_AGENT_CREATE",
    description: "Create a new AI agent for a Discord server",
    inputSchema: z
      .object({
        guild_id: z.string().describe("Discord server/guild ID"),
        command: z
          .string()
          .describe("Command to trigger the agent (e.g., 'issues')"),
        name: z.string().describe("Friendly name for the agent"),
        description: z.string().optional().describe("Agent description"),
        system_prompt: z.string().optional().describe("Custom system prompt"),
        agent_binding_id: z
          .string()
          .default("default")
          .describe("Agent binding ID"),
        model_id: z.string().optional().describe("Language model ID"),
        context_messages: z
          .number()
          .default(10)
          .describe("Number of context messages to include"),
        max_tokens: z.number().optional().describe("Max tokens in response"),
        temperature: z.number().optional().describe("Model temperature"),
        avatar_url: z.string().optional().describe("Custom avatar URL"),
        color: z.string().optional().describe("Hex color for embeds"),
        created_by: z.string().describe("User ID who created the agent"),
      })
      .strict(),
    outputSchema: z
      .object({
        agent: AgentConfigSchema,
        success: z.boolean(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const ctx = context as {
        guild_id: string;
        command: string;
        name: string;
        description?: string;
        system_prompt?: string;
        agent_binding_id: string;
        model_id?: string;
        context_messages: number;
        max_tokens?: number;
        temperature?: number;
        avatar_url?: string;
        color?: string;
        created_by: string;
      };

      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      const result = await runSQL<AgentConfig>(
        env,
        `INSERT INTO discord_agent_config 
         (id, guild_id, command, name, description, system_prompt, 
          agent_binding_id, model_id, context_messages, max_tokens, 
          temperature, avatar_url, color, enabled, created_at, updated_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true, $14, $15, $16)
         RETURNING *`,
        [
          id,
          ctx.guild_id,
          ctx.command.toLowerCase(),
          ctx.name,
          ctx.description || null,
          ctx.system_prompt || null,
          ctx.agent_binding_id,
          ctx.model_id || null,
          ctx.context_messages,
          ctx.max_tokens || null,
          ctx.temperature || null,
          ctx.avatar_url || null,
          ctx.color || null,
          now,
          now,
          ctx.created_by,
        ],
      );

      return {
        agent: result[0],
        success: true,
      };
    },
  });

/**
 * Delete an agent
 */
export const createAgentDeleteTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_AGENT_DELETE",
    description: "Delete an AI agent configuration",
    inputSchema: z
      .object({
        guild_id: z.string().describe("Discord server/guild ID"),
        command: z.string().describe("Agent command name"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        deleted_id: z.string().nullable(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const { guild_id, command } = context as {
        guild_id: string;
        command: string;
      };

      const result = await runSQL<{ id: string }>(
        env,
        `DELETE FROM discord_agent_config WHERE guild_id = $1 AND command = $2 RETURNING id`,
        [guild_id, command],
      );

      return {
        success: result.length > 0,
        deleted_id: result[0]?.id || null,
      };
    },
  });

// ============================================================================
// Export
// ============================================================================

export const agentTools = [
  createAgentListTool,
  createAgentGetTool,
  createAgentCreateTool,
  createAgentDeleteTool,
];
