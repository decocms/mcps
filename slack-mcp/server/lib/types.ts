/**
 * Slack API Types
 */

// Slack Event Types
export interface SlackEvent {
  type: string;
  event_ts: string;
  user?: string;
  channel?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  bot_id?: string;
  subtype?: string;
}

export interface SlackMessageEvent extends SlackEvent {
  type: "message";
  channel: string;
  user: string;
  text: string;
  ts: string;
  thread_ts?: string;
  channel_type?: "channel" | "group" | "im" | "mpim";
}

export interface SlackAppMentionEvent extends SlackEvent {
  type: "app_mention";
  channel: string;
  user: string;
  text: string;
  ts: string;
  thread_ts?: string;
}

export interface SlackReactionAddedEvent extends SlackEvent {
  type: "reaction_added";
  user: string;
  reaction: string;
  item: {
    type: string;
    channel: string;
    ts: string;
  };
  item_user: string;
}

export interface SlackChannelCreatedEvent {
  type: "channel_created";
  event_ts: string;
  channel: {
    id: string;
    name: string;
    created: number;
    creator: string;
  };
}

export interface SlackMemberJoinedChannelEvent extends SlackEvent {
  type: "member_joined_channel";
  user: string;
  channel: string;
  channel_type: string;
  team: string;
  inviter?: string;
}

// Webhook Payload Types
export interface SlackWebhookPayload {
  token?: string;
  team_id?: string;
  api_app_id?: string;
  event?: SlackEvent;
  type: "url_verification" | "event_callback" | "app_rate_limited";
  challenge?: string;
  event_id?: string;
  event_time?: number;
  authorizations?: Array<{
    enterprise_id: string | null;
    team_id: string;
    user_id: string;
    is_bot: boolean;
    is_enterprise_install: boolean;
  }>;
}

// Slack API Response Types
export interface SlackUser {
  id: string;
  team_id: string;
  name: string;
  deleted: boolean;
  real_name?: string;
  profile: {
    display_name: string;
    real_name: string;
    email?: string;
    image_24?: string;
    image_32?: string;
    image_48?: string;
    image_72?: string;
    image_192?: string;
    image_512?: string;
  };
  is_admin: boolean;
  is_owner: boolean;
  is_bot: boolean;
  tz?: string;
  tz_label?: string;
}

export interface SlackChannel {
  id: string;
  name: string;
  is_channel: boolean;
  is_group: boolean;
  is_im: boolean;
  is_mpim: boolean;
  is_private: boolean;
  is_archived: boolean;
  is_member: boolean;
  created: number;
  creator: string;
  topic?: {
    value: string;
    creator: string;
    last_set: number;
  };
  purpose?: {
    value: string;
    creator: string;
    last_set: number;
  };
  num_members?: number;
}

export interface SlackMessage {
  type: string;
  user?: string;
  bot_id?: string;
  text: string;
  ts: string;
  thread_ts?: string;
  reply_count?: number;
  reply_users_count?: number;
  latest_reply?: string;
  reactions?: Array<{
    name: string;
    count: number;
    users: string[];
  }>;
  files?: Array<{
    id: string;
    name: string;
    mimetype: string;
    url_private: string;
  }>;
}

// Thread types for conversation management
export interface ThreadContext {
  threadId: string; // Unique ID for the logical thread
  slackThreadTs?: string; // Slack's thread_ts if in a thread
  channelId: string;
  messages: ThreadMessage[];
  lastActivity: number;
  metadata?: Record<string, unknown>;
}

export interface ThreadMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  slackTs?: string;
  userId?: string;
  userName?: string;
}

// Slash command types
export interface SlackSlashCommand {
  token: string;
  team_id: string;
  team_domain: string;
  channel_id: string;
  channel_name: string;
  user_id: string;
  user_name: string;
  command: string;
  text: string;
  response_url: string;
  trigger_id: string;
  api_app_id: string;
}

// Block Kit types (simplified)
export interface SlackBlock {
  type: string;
  block_id?: string;
  text?: {
    type: "plain_text" | "mrkdwn";
    text: string;
    emoji?: boolean;
  };
  elements?: unknown[];
  accessory?: unknown;
}
