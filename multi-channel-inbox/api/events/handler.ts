import type { Env } from "../types/env.ts";
import { processDiscordEvent } from "../ingestion/discord.ts";
import { processSlackEvent } from "../ingestion/slack.ts";

export const INBOX_EVENTS = [
  "slack.message.*",
  "discord.message.created",
] as const;

interface CloudEvent {
  type: string;
  data: Record<string, unknown>;
  source?: string;
  subject?: string;
  id?: string;
  time?: string;
}

export async function handleInboxEvents(
  events: CloudEvent[],
  env: Env,
): Promise<void> {
  for (const event of events) {
    try {
      if (event.type.startsWith("slack.message")) {
        await processSlackEvent(
          event as Parameters<typeof processSlackEvent>[0],
          env,
        );
      } else if (event.type === "discord.message.created") {
        await processDiscordEvent(
          event as Parameters<typeof processDiscordEvent>[0],
          env,
        );
      }
    } catch (error) {
      console.error(`[EVENTS] Error processing ${event.type}:`, error);
    }
  }
}
