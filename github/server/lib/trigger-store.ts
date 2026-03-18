/**
 * Trigger Store
 *
 * In-memory trigger configuration storage and static trigger definitions
 * for the Mesh automations system.
 */

export interface TriggerDefinition {
  type: string;
  description: string;
  params: {
    name: string;
    type: string;
    description: string;
    required: boolean;
  }[];
}

interface TriggerConfig {
  type: string;
  params: Record<string, string>;
  enabled: boolean;
}

export const GITHUB_TRIGGER_DEFINITIONS: TriggerDefinition[] = [
  {
    type: "github.push",
    description: "Code pushed to a branch",
    params: [
      {
        name: "repo",
        type: "string",
        description: "Repository full name e.g. owner/repo",
        required: false,
      },
    ],
  },
  {
    type: "github.pull_request.opened",
    description: "Pull request opened",
    params: [
      {
        name: "repo",
        type: "string",
        description: "Repository full name e.g. owner/repo",
        required: false,
      },
    ],
  },
  {
    type: "github.pull_request.closed",
    description: "Pull request closed or merged",
    params: [
      {
        name: "repo",
        type: "string",
        description: "Repository full name e.g. owner/repo",
        required: false,
      },
    ],
  },
  {
    type: "github.pull_request.review_requested",
    description: "Review requested on a PR",
    params: [
      {
        name: "repo",
        type: "string",
        description: "Repository full name e.g. owner/repo",
        required: false,
      },
    ],
  },
  {
    type: "github.issues.opened",
    description: "Issue opened",
    params: [
      {
        name: "repo",
        type: "string",
        description: "Repository full name e.g. owner/repo",
        required: false,
      },
    ],
  },
  {
    type: "github.issues.closed",
    description: "Issue closed",
    params: [
      {
        name: "repo",
        type: "string",
        description: "Repository full name e.g. owner/repo",
        required: false,
      },
    ],
  },
  {
    type: "github.issue_comment.created",
    description: "Comment on issue or PR",
    params: [
      {
        name: "repo",
        type: "string",
        description: "Repository full name e.g. owner/repo",
        required: false,
      },
    ],
  },
  {
    type: "github.pull_request_review.submitted",
    description: "PR review submitted",
    params: [
      {
        name: "repo",
        type: "string",
        description: "Repository full name e.g. owner/repo",
        required: false,
      },
    ],
  },
  {
    type: "github.release.published",
    description: "Release published",
    params: [
      {
        name: "repo",
        type: "string",
        description: "Repository full name e.g. owner/repo",
        required: false,
      },
    ],
  },
  {
    type: "github.workflow_run.completed",
    description: "Actions workflow completed",
    params: [
      {
        name: "repo",
        type: "string",
        description: "Repository full name e.g. owner/repo",
        required: false,
      },
    ],
  },
];

const triggerConfigs = new Map<string, TriggerConfig>();

const KNOWN_TYPES = new Set(GITHUB_TRIGGER_DEFINITIONS.map((d) => d.type));

export function listTriggerDefinitions(): TriggerDefinition[] {
  return GITHUB_TRIGGER_DEFINITIONS;
}

export function configureTrigger(
  type: string,
  params: Record<string, string>,
  enabled: boolean,
): void {
  if (!KNOWN_TYPES.has(type)) {
    throw new Error(`Unknown trigger type: ${type}`);
  }
  const key = `${type}::${params.repo ?? "*"}`;
  if (enabled) {
    triggerConfigs.set(key, { type, params, enabled });
  } else {
    triggerConfigs.delete(key);
  }
}

export function hasMatchingTrigger(eventType: string, repo?: string): boolean {
  for (const config of triggerConfigs.values()) {
    if (!config.enabled) continue;
    if (config.type !== eventType) continue;
    if (config.params.repo && repo && config.params.repo !== repo) continue;
    return true;
  }
  return false;
}
