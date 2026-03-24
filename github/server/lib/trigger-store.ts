/**
 * Trigger Store
 *
 * In-memory trigger configuration storage and static trigger definitions
 * for the Mesh automations system.
 */

import type { TriggerDefinition } from "@decocms/bindings/trigger";

interface TriggerConfig {
  type: string;
  params: Record<string, string>;
  enabled: boolean;
  connectionId: string;
}

const REPO_PARAM_SCHEMA: TriggerDefinition["paramsSchema"] = {
  repo: { type: "string", description: "Repository full name e.g. owner/repo" },
};

export const GITHUB_TRIGGER_DEFINITIONS = [
  {
    type: "github.push",
    description: "Code pushed to a branch",
    paramsSchema: REPO_PARAM_SCHEMA,
  },
  {
    type: "github.pull_request.opened",
    description: "Pull request opened",
    paramsSchema: REPO_PARAM_SCHEMA,
  },
  {
    type: "github.pull_request.closed",
    description: "Pull request closed or merged",
    paramsSchema: REPO_PARAM_SCHEMA,
  },
  {
    type: "github.pull_request.review_requested",
    description: "Review requested on a PR",
    paramsSchema: REPO_PARAM_SCHEMA,
  },
  {
    type: "github.issues.opened",
    description: "Issue opened",
    paramsSchema: REPO_PARAM_SCHEMA,
  },
  {
    type: "github.issues.closed",
    description: "Issue closed",
    paramsSchema: REPO_PARAM_SCHEMA,
  },
  {
    type: "github.issue_comment.created",
    description: "Comment on issue or PR",
    paramsSchema: REPO_PARAM_SCHEMA,
  },
  {
    type: "github.pull_request_review.submitted",
    description: "PR review submitted",
    paramsSchema: REPO_PARAM_SCHEMA,
  },
  {
    type: "github.release.published",
    description: "Release published",
    paramsSchema: REPO_PARAM_SCHEMA,
  },
  {
    type: "github.workflow_run.completed",
    description: "Actions workflow completed",
    paramsSchema: REPO_PARAM_SCHEMA,
  },
] satisfies TriggerDefinition[];

const triggerConfigs = new Map<string, TriggerConfig>();

const KNOWN_TYPES = new Set(GITHUB_TRIGGER_DEFINITIONS.map((d) => d.type));

export function listTriggerDefinitions(): TriggerDefinition[] {
  return GITHUB_TRIGGER_DEFINITIONS;
}

export function configureTrigger(
  type: string,
  params: Record<string, string>,
  enabled: boolean,
  connectionId: string,
): void {
  if (!KNOWN_TYPES.has(type)) {
    throw new Error(`Unknown trigger type: ${type}`);
  }
  const key = `${connectionId}::${type}::${params.repo ?? "*"}`;
  if (enabled) {
    triggerConfigs.set(key, { type, params, enabled, connectionId });
  } else {
    triggerConfigs.delete(key);
  }
}

export function hasMatchingTrigger(
  eventType: string,
  repo: string | undefined,
  connectionId: string,
): boolean {
  for (const config of triggerConfigs.values()) {
    if (!config.enabled) continue;
    if (config.connectionId !== connectionId) continue;
    if (config.type !== eventType) continue;
    if (config.params.repo && repo && config.params.repo !== repo) continue;
    return true;
  }
  return false;
}
