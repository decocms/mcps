import { createTriggers, type TriggerStorage } from "@decocms/runtime/triggers";
import {
  saveTriggerCredentials,
  loadTriggerCredentials,
  deleteTriggerCredentials,
} from "./supabase-client.ts";
import { z } from "zod";

/**
 * Supabase-backed trigger storage.
 *
 * Uses static SUPABASE_URL / SUPABASE_ANON_KEY env vars (never expire).
 */
class SupabaseTriggerStorage implements TriggerStorage {
  async get(connectionId: string) {
    const result = await loadTriggerCredentials(connectionId);
    console.log(
      `[TriggerStorage] GET ${connectionId}: ${result ? "found credentials" : "empty"}`,
    );
    return result;
  }

  async set(connectionId: string, state: any) {
    console.log(`[TriggerStorage] SET ${connectionId}: saving credentials`);
    await saveTriggerCredentials(connectionId, state);
  }

  async delete(connectionId: string) {
    try {
      console.log(`[TriggerStorage] DELETE ${connectionId}`);
      await deleteTriggerCredentials(connectionId);
    } catch (error) {
      console.error(
        `[TriggerStorage] DELETE ${connectionId} failed:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

const storage = new SupabaseTriggerStorage();

export const triggers = createTriggers({
  definitions: [
    {
      type: "slack.message.received",
      description: "Triggered when a message is sent in a Slack channel or DM",
      params: z.object({
        channel_id: z
          .string()
          .optional()
          .describe("Filter by channel ID. Leave empty for all channels."),
        is_dm: z
          .boolean()
          .optional()
          .describe("Filter by DM only. Leave empty for all messages."),
      }),
    },
    {
      type: "slack.app_mention",
      description: "Triggered when the bot is mentioned with @",
      params: z.object({
        channel_id: z
          .string()
          .optional()
          .describe("Filter by channel ID. Leave empty for all channels."),
      }),
    },
    {
      type: "slack.reaction.added",
      description: "Triggered when a reaction emoji is added to a message",
      params: z.object({
        channel_id: z
          .string()
          .optional()
          .describe("Filter by channel ID. Leave empty for all channels."),
      }),
    },
    {
      type: "slack.channel.created",
      description: "Triggered when a new channel is created",
      params: z.object({}),
    },
    {
      type: "slack.member.joined",
      description: "Triggered when a member joins a channel",
      params: z.object({
        channel_id: z
          .string()
          .optional()
          .describe("Filter by channel ID. Leave empty for all channels."),
      }),
    },
  ],
  storage,
});
