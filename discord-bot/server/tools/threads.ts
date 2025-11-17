/**
 * MCP tools for Discord thread operations
 *
 * This file implements tools for:
 * - Creating threads
 * - Joining and leaving threads
 * - Listing active and archived threads
 */

import type { Env } from "../main.ts";
import { createDiscordClient } from "./utils/discord-client.ts";
import { createPrivateTool } from "@decocms/runtime/mastra";
import {
  createThreadInputSchema,
  createThreadOutputSchema,
  joinThreadInputSchema,
  joinThreadOutputSchema,
  leaveThreadInputSchema,
  leaveThreadOutputSchema,
  getActiveThreadsInputSchema,
  getActiveThreadsOutputSchema,
  getArchivedThreadsInputSchema,
  getArchivedThreadsOutputSchema,
} from "../lib/types.ts";

/**
 * CREATE_THREAD - Create a new thread in a channel
 */
export const createCreateThreadTool = (env: Env) =>
  createPrivateTool({
    id: "CREATE_THREAD",
    description:
      "Create a new thread in a Discord channel. Threads are temporary sub-channels for organized conversations. You can configure auto-archive duration and other settings.",
    inputSchema: createThreadInputSchema,
    outputSchema: createThreadOutputSchema,
    execute: async ({ context }) => {
      const {
        channelId,
        name,
        autoArchiveDuration,
        type,
        invitable,
        rateLimitPerUser,
      } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      if (!name || name.length < 1 || name.length > 100) {
        throw new Error("Thread name must be between 1 and 100 characters");
      }

      const client = createDiscordClient({ botToken: state.botToken });

      const body: any = {
        name,
      };

      if (autoArchiveDuration !== undefined) {
        body.auto_archive_duration = autoArchiveDuration;
      }
      if (type !== undefined) body.type = type;
      if (invitable !== undefined) body.invitable = invitable;
      if (rateLimitPerUser !== undefined) {
        body.rate_limit_per_user = rateLimitPerUser;
      }

      try {
        const thread = await client.createThread(channelId, body);
        return {
          id: thread.id,
          type: thread.type,
          name: thread.name,
          guild_id: thread.guild_id,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to create thread: ${message}`);
      }
    },
  });

/**
 * JOIN_THREAD - Join a thread
 */
export const createJoinThreadTool = (env: Env) =>
  createPrivateTool({
    id: "JOIN_THREAD",
    description:
      "Join a thread channel. The bot needs to join a thread to receive messages and participate in the conversation.",
    inputSchema: joinThreadInputSchema,
    outputSchema: joinThreadOutputSchema,
    execute: async ({ context }) => {
      const { channelId } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      const client = createDiscordClient({ botToken: state.botToken });

      try {
        await client.joinThread(channelId);
        return {
          success: true,
          message: "Successfully joined thread",
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to join thread: ${message}`);
      }
    },
  });

/**
 * LEAVE_THREAD - Leave a thread
 */
export const createLeaveThreadTool = (env: Env) =>
  createPrivateTool({
    id: "LEAVE_THREAD",
    description:
      "Leave a thread channel. After leaving, the bot will no longer receive messages from that thread.",
    inputSchema: leaveThreadInputSchema,
    outputSchema: leaveThreadOutputSchema,
    execute: async ({ context }) => {
      const { channelId } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      const client = createDiscordClient({ botToken: state.botToken });

      try {
        await client.leaveThread(channelId);
        return {
          success: true,
          message: "Successfully left thread",
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to leave thread: ${message}`);
      }
    },
  });

/**
 * GET_ACTIVE_THREADS - Get all active threads in a guild
 */
export const createGetActiveThreadsTool = (env: Env) =>
  createPrivateTool({
    id: "GET_ACTIVE_THREADS",
    description:
      "Fetch all active (non-archived) threads in a Discord server (guild). Returns threads that are currently open for conversation.",
    inputSchema: getActiveThreadsInputSchema,
    outputSchema: getActiveThreadsOutputSchema,
    execute: async ({ context }) => {
      const { guildId } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      const client = createDiscordClient({ botToken: state.botToken });

      try {
        const response = await client.getActiveThreads(guildId);
        return {
          threads: response.threads.map((thread: any) => ({
            id: thread.id,
            type: thread.type,
            name: thread.name,
            guild_id: thread.guild_id,
          })),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to get active threads: ${message}`);
      }
    },
  });

/**
 * GET_ARCHIVED_THREADS - Get archived threads from a channel
 */
export const createGetArchivedThreadsTool = (env: Env) =>
  createPrivateTool({
    id: "GET_ARCHIVED_THREADS",
    description:
      "Fetch archived threads from a Discord channel. Can retrieve either public or private archived threads. Archived threads are inactive but can be reopened.",
    inputSchema: getArchivedThreadsInputSchema,
    outputSchema: getArchivedThreadsOutputSchema,
    execute: async ({ context }) => {
      const { channelId, type, before, limit = 50 } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      const client = createDiscordClient({ botToken: state.botToken });

      const searchParams: Record<string, string> = {
        limit: Math.min(Math.max(limit, 1), 100).toString(),
      };

      if (before) searchParams.before = before;

      try {
        const response = await client.getArchivedThreads(
          channelId,
          type,
          searchParams,
        );
        return {
          threads: response.threads.map((thread: any) => ({
            id: thread.id,
            type: thread.type,
            name: thread.name,
            guild_id: thread.guild_id,
          })),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to get archived threads: ${message}`);
      }
    },
  });

/**
 * Array of all thread-related tools
 */
export const threadTools = [
  createCreateThreadTool,
  createJoinThreadTool,
  createLeaveThreadTool,
  createGetActiveThreadsTool,
  createGetArchivedThreadsTool,
];
