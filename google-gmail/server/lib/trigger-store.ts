import { createTriggers } from "@decocms/runtime/triggers";
import { z } from "zod";

interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

interface TriggerState {
  credentials: { callbackUrl: string; callbackToken: string };
  activeTriggerTypes: string[];
}

// TriggerStorage backed by the same Workers KV namespace used for
// email→connection mappings (prefix `triggers:` to keep data disjoint).
//
// The KV binding is per-request, but trigger-store is a module-level
// singleton — we thread the current binding through a module-local
// variable set at the top of each fetch handler.
let currentKV: KVNamespaceLike | undefined;

export function setTriggerKV(kv: KVNamespaceLike | undefined): void {
  currentKV = kv;
}

const triggerStorage = {
  async get(connectionId: string): Promise<TriggerState | null> {
    if (!currentKV) return null;
    const raw = await currentKV.get(`triggers:${connectionId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as TriggerState;
    } catch {
      return null;
    }
  },
  async set(connectionId: string, state: TriggerState): Promise<void> {
    if (!currentKV) return;
    await currentKV.put(`triggers:${connectionId}`, JSON.stringify(state));
  },
  async delete(connectionId: string): Promise<void> {
    if (!currentKV) return;
    await currentKV.delete(`triggers:${connectionId}`);
  },
};

export const triggers = createTriggers({
  definitions: [
    {
      type: "gmail.message.received",
      description:
        "Triggered when a new email lands in INBOX. Optional filters on sender address or Gmail label.",
      // Mesh's paramsMatch (see studio/apps/mesh/src/automations/event-
      // trigger-engine.ts) supports strict `data[key] === value` plus
      // an array-includes sugar: when `data[key]` is an array and the
      // user's param value is a scalar, it matches via `array.includes`.
      // That's why `labelIds` works as a string filter even though the
      // emitted payload is an array.
      //
      // Substring matching (`{ op: "contains" }`) is also supported by
      // mesh but requires the user to enter operator-object JSON in the
      // trigger config UI, which isn't ergonomic yet — adding fields
      // like `subject_contains` will land once the UI / runtime grow
      // first-class support for declaring matcher kinds per field.
      params: z.object({
        from: z
          .string()
          .optional()
          .describe(
            "Match only emails sent from this exact address (e.g. alice@example.com). Leave empty for any sender.",
          ),
        labelIds: z
          .string()
          .optional()
          .describe(
            "Match only emails carrying this Gmail label id (e.g. INBOX, IMPORTANT, STARRED, or a custom label id). Leave empty for any label.",
          ),
      }),
    },
  ],
  storage: triggerStorage,
});
