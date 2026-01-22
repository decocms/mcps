/**
 * Event Handler Types
 *
 * Type definitions for Slack event handling.
 */

import type { SlackEvent } from "../../lib/types.ts";

/**
 * Event types for publishing to Event Bus
 */
export const SLACK_EVENT_TYPES = {
  // Incoming events (from Slack)
  MESSAGE_RECEIVED: "slack.message.received",
  APP_MENTION: "slack.app_mention",
  REACTION_ADDED: "slack.reaction.added",
  CHANNEL_CREATED: "slack.channel.created",
  MEMBER_JOINED: "slack.member.joined",

  // Outgoing events (to Event Bus for LLM processing)
  // Note: Uses "public:" prefix so mcp-studio can receive it
  OPERATOR_GENERATE: "public:operator.generate",

  // Response events (from Event Bus)
  OPERATOR_TEXT_COMPLETED: "public:operator.text.completed",
  OPERATOR_GENERATION_COMPLETED: "public:operator.generation.completed",
} as const;

/**
 * Context for a Slack event
 */
export interface SlackEventContext {
  type: string;
  payload: SlackEvent & { original_text?: string };
  teamId?: string;
  apiAppId?: string;
}

/**
 * Configuration for a Slack team (from data storage)
 */
export interface SlackTeamConfig {
  teamId: string;
  organizationId: string;
  meshUrl: string;
  botToken: string;
  signingSecret: string;
  botUserId?: string;
  configuredAt: string;
}

/**
 * Options for publishing events to Event Bus
 */
export interface EventPublishOptions {
  meshUrl: string;
  organizationId: string;
}

/**
 * Context passed with LLM generation request
 */
export interface LLMGenerationContext {
  channel: string;
  threadTs?: string;
  messageTs?: string;
  userId?: string;
  isDM?: boolean;
}

/**
 * Slack webhook payload structure
 */
export interface SlackWebhookPayload {
  type?: string;
  challenge?: string;
  event?: SlackEvent;
  team_id?: string;
  token?: string;
  api_app_id?: string;
}

/**
 * Options for Mesh configuration
 */
export interface MeshConfig {
  organizationId: string;
  meshUrl: string;
}
