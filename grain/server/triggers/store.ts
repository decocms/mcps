import { createTriggers, type TriggerStorage } from "@decocms/runtime/triggers";
import {
  saveTriggerCredentials,
  loadTriggerCredentials,
  deleteTriggerCredentials,
  type TriggerState,
} from "../lib/supabase-client.ts";
import { z } from "zod";

class SupabaseTriggerStorage implements TriggerStorage {
  async get(connectionId: string) {
    return loadTriggerCredentials(connectionId);
  }

  async set(connectionId: string, state: TriggerState) {
    await saveTriggerCredentials(connectionId, state);
  }

  async delete(connectionId: string) {
    try {
      await deleteTriggerCredentials(connectionId);
    } catch (error) {
      console.error(
        `[GRAIN_MCP] Failed to delete trigger credentials for ${connectionId}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

const recordingParams = z.object({
  owner_email: z
    .string()
    .optional()
    .describe("Only trigger for recordings owned by this email address"),
  tag: z
    .string()
    .optional()
    .describe("Only trigger when the recording has this exact tag"),
  participant_email: z
    .string()
    .optional()
    .describe("Only trigger when this participant email was in the meeting"),
});

export const triggers = createTriggers({
  definitions: [
    {
      type: "grain.recording.added",
      description:
        "Triggered when a new Grain meeting recording is indexed. " +
        "Payload: `recording_id`, `title`, `url`, `start_datetime`, `end_datetime`, " +
        "`owners` (email list), `tags`, `participants` (array of {name, email}), " +
        "`has_summary` (AI notes available), `indexed_at`.",
      params: recordingParams,
    },
    {
      type: "grain.recording.updated",
      description:
        "Triggered when an existing Grain meeting recording is updated (e.g. AI notes ready). " +
        "Same payload as grain.recording.added.",
      params: recordingParams,
    },
  ],
  storage: new SupabaseTriggerStorage(),
});
