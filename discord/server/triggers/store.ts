/**
 * Supabase-backed storage for the @decocms/runtime/triggers system.
 *
 * Trigger definitions live in ./definitions.ts; this module wires storage and
 * exports the singleton `triggers` instance everywhere else imports.
 */

import { createTriggers, type TriggerStorage } from "@decocms/runtime/triggers";
import {
  saveTriggerCredentials,
  loadTriggerCredentials,
  deleteTriggerCredentials,
} from "../lib/supabase.ts";
import { triggerDefinitions } from "./definitions.ts";

class SupabaseTriggerStorage implements TriggerStorage {
  async get(connectionId: string) {
    try {
      return await loadTriggerCredentials(connectionId);
    } catch {
      return null;
    }
  }

  async set(connectionId: string, state: any) {
    try {
      await saveTriggerCredentials(connectionId, state);
    } catch {
      // swallow: trigger registration is best-effort
    }
  }

  async delete(connectionId: string) {
    try {
      await deleteTriggerCredentials(connectionId);
    } catch {
      // swallow
    }
  }
}

const storage = new SupabaseTriggerStorage();

export const triggers = createTriggers({
  definitions: triggerDefinitions,
  storage,
});
