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
// installation mappings (prefix `triggers:` to keep the data disjoint).
//
// The KV binding is per-request, but trigger-store is a module-level
// singleton. We thread the current binding through a module-local
// variable set at the top of each fetch handler — safe because all
// concurrent requests on the same isolate share the same env/bindings.
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
      type: "github.push",
      description: "Triggered when code is pushed to a repository",
      params: z.object({
        repo: z
          .string()
          .describe(
            "Repository full name (owner/repo). Leave empty for all repos.",
          ),
      }),
    },
    {
      type: "github.pull_request.opened",
      description: "Triggered when a pull request is opened",
      params: z.object({
        repo: z
          .string()
          .describe(
            "Repository full name (owner/repo). Leave empty for all repos.",
          ),
      }),
    },
    {
      type: "github.pull_request.closed",
      description: "Triggered when a pull request is closed or merged",
      params: z.object({
        repo: z
          .string()
          .describe(
            "Repository full name (owner/repo). Leave empty for all repos.",
          ),
      }),
    },
    {
      type: "github.issues.opened",
      description: "Triggered when an issue is opened",
      params: z.object({
        repo: z
          .string()
          .describe(
            "Repository full name (owner/repo). Leave empty for all repos.",
          ),
      }),
    },
    {
      type: "github.issues.closed",
      description: "Triggered when an issue is closed",
      params: z.object({
        repo: z
          .string()
          .describe(
            "Repository full name (owner/repo). Leave empty for all repos.",
          ),
      }),
    },
    {
      type: "github.issue_comment.created",
      description: "Triggered when a comment is added to an issue or PR",
      params: z.object({
        repo: z
          .string()
          .describe(
            "Repository full name (owner/repo). Leave empty for all repos.",
          ),
      }),
    },
    {
      type: "github.pull_request_review.submitted",
      description: "Triggered when a pull request review is submitted",
      params: z.object({
        repo: z
          .string()
          .describe(
            "Repository full name (owner/repo). Leave empty for all repos.",
          ),
      }),
    },
    {
      type: "github.workflow_run.completed",
      description: "Triggered when a GitHub Actions workflow run completes",
      params: z.object({
        repo: z
          .string()
          .describe(
            "Repository full name (owner/repo). Leave empty for all repos.",
          ),
      }),
    },
  ],
  storage: triggerStorage,
});
