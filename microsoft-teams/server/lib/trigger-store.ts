import { createTriggers, type TriggerStorage } from "@decocms/runtime/triggers";
import { getKvStore } from "./kv.ts";
import { z } from "zod";

const STORAGE_PREFIX = "triggers:";

/**
 * KV-backed trigger storage.
 * Uses the local JSON-file KV store — no external service required.
 */
class KvTriggerStorage implements TriggerStorage {
  async get(connectionId: string) {
    const kv = getKvStore();
    const result = await kv.get(`${STORAGE_PREFIX}${connectionId}`);
    console.log(
      `[TriggerStorage] GET ${connectionId}: ${result ? "found" : "empty"}`,
    );
    return result as any;
  }

  async set(connectionId: string, state: any) {
    const kv = getKvStore();
    console.log(`[TriggerStorage] SET ${connectionId}`);
    await kv.set(`${STORAGE_PREFIX}${connectionId}`, state);
  }

  async delete(connectionId: string) {
    const kv = getKvStore();
    console.log(`[TriggerStorage] DELETE ${connectionId}`);
    await kv.delete(`${STORAGE_PREFIX}${connectionId}`);
  }
}

export const triggers = createTriggers({
  definitions: [
    {
      type: "teams.message.received",
      description:
        "Triggered when a new message is posted in a Microsoft Teams channel. " +
        "Payload includes: `team_id`, `channel_id`, `message_id`, `text` (plain-text body), " +
        "`sender_name`, `sender_id`, `reply_to_id` (set when the message is a reply in a thread), " +
        "and `web_url` (direct link to the message). " +
        "To respond: call SEND_MESSAGE with team_id and channel_id, or " +
        "REPLY_TO_MESSAGE with team_id, channel_id, and message_id to reply in the same thread.",
      params: z.object({
        team_id: z

          .string()

          .optional()

          .describe(
            "Filter by Team ID. Leave empty to receive messages from all subscribed teams.",
          ),
        channel_id: z

          .string()

          .optional()

          .describe(
            "Filter by Channel ID. Leave empty to receive messages from all subscribed channels.",
          ),
      }),
    },
  ],
  storage: new KvTriggerStorage(),
});
