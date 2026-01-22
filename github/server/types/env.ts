/**
 * Environment Type Definitions for GitHub MCP
 *
 * Defines the StateSchema for user configuration and type definitions
 * for the runtime environment.
 */

import type { Registry } from "@decocms/mcps-shared/registry";
import { BindingOf, type DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

/**
 * All available GitHub webhook event types
 * Users can select which events to subscribe to
 */
export const GITHUB_WEBHOOK_EVENTS = [
  "push",
  "pull_request",
  "pull_request_review",
  "pull_request_review_comment",
  "issues",
  "issue_comment",
  "release",
  "create",
  "delete",
  "fork",
  "star",
  "watch",
  "workflow_run",
  "workflow_job",
  "check_run",
  "check_suite",
  "deployment",
  "deployment_status",
  "commit_comment",
  "discussion",
  "discussion_comment",
  "label",
  "milestone",
  "project",
  "project_card",
  "project_column",
  "repository",
  "branch_protection_rule",
  "code_scanning_alert",
  "dependabot_alert",
  "secret_scanning_alert",
] as const;

export type GitHubWebhookEvent = (typeof GITHUB_WEBHOOK_EVENTS)[number];

/**
 * State schema defining user-configurable options and required bindings
 *
 * Note: No database needed - state is managed by Mesh via MESH_REQUEST_CONTEXT.state
 */
export const StateSchema = z.object({
  // Required binding for publishing events
  EVENT_BUS: BindingOf("@deco/event-bus"),

  /**
   * Target for webhook registration:
   * - Empty string or not set: Register webhooks for ALL accessible repositories
   * - "org:orgname": Register a single organization-wide webhook (more efficient)
   * - "owner/repo": Register webhook for a specific repository only
   *
   * Examples:
   * - "" → All repos accessible to the GitHub App
   * - "org:decocms" → Organization webhook for decocms org
   * - "decocms/mesh" → Only the decocms/mesh repository
   */
  TARGET: z
    .string()
    .default("")
    .describe(
      'Webhook target. Leave empty for all repos, use "org:name" for organization webhook, or "owner/repo" for a specific repository.',
    ),

  // User-selectable webhook events
  WEBHOOK_EVENTS: z
    .array(z.enum(GITHUB_WEBHOOK_EVENTS))
    .default(["push", "pull_request", "issues", "release"])
    .describe(
      "GitHub webhook events to subscribe to. Select the events you want to receive.",
    ),
});

/**
 * Environment type combining Deco bindings with shared Registry
 */
export type Env = DefaultEnv<typeof StateSchema, Registry>;

export type { Registry };
