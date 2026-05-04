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
        "Triggered when a new email lands in INBOX. Optional exact-match filter on the sender's address.",
      // Mesh's paramsMatch does strict `data[key] === value` (see
      // apps/mesh/src/automations/event-trigger-engine.ts), so only
      // exact-equality filters are useful here. Substring matching
      // (e.g. "subject contains 'invoice'") and array-contains (e.g.
      // "labelIds includes IMPORTANT") would need first-class support
      // in mesh; the full payload is still in `data` for downstream
      // filtering inside the workflow itself.
      params: z.object({
        from: z
          .string()
          .optional()
          .describe(
            "Match only emails sent from this exact address (e.g. alice@example.com). Leave empty for any sender.",
          ),
      }),
    },
  ],
  storage: triggerStorage,
});
