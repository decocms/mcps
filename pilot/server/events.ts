/**
 * Pilot Event Types
 *
 * Defines the CloudEvent types used for communication between
 * interfaces (WhatsApp, CLI, etc.) and the Pilot agent.
 */

import { z } from "zod";

// ============================================================================
// Incoming Events (Pilot subscribes to)
// ============================================================================

/**
 * User message received from any interface
 */
export const UserMessageEventSchema = z.object({
  /** The message text */
  text: z.string(),

  /** Source interface (whatsapp, cli, raycast, etc.) */
  source: z.string(),

  /** Optional chat/conversation ID for context */
  chatId: z.string().optional(),

  /** Optional sender info */
  sender: z
    .object({
      id: z.string().optional(),
      name: z.string().optional(),
    })
    .optional(),

  /** Optional reply-to message ID for threaded conversations */
  replyTo: z.string().optional(),

  /** Interface-specific metadata */
  metadata: z.record(z.unknown()).optional(),
});

export type UserMessageEvent = z.infer<typeof UserMessageEventSchema>;

/**
 * Direct command from user (not conversational)
 */
export const UserCommandEventSchema = z.object({
  /** Command name */
  command: z.string(),

  /** Command arguments */
  args: z.record(z.unknown()).optional(),

  /** Source interface */
  source: z.string(),
});

export type UserCommandEvent = z.infer<typeof UserCommandEventSchema>;

// ============================================================================
// Outgoing Events (Pilot publishes)
// ============================================================================

/**
 * Task created and acknowledged
 */
export const TaskCreatedEventSchema = z.object({
  /** Task ID */
  taskId: z.string(),

  /** Original user message */
  userMessage: z.string(),

  /** Source interface to reply to */
  source: z.string(),

  /** Chat ID for replies */
  chatId: z.string().optional(),
});

export type TaskCreatedEvent = z.infer<typeof TaskCreatedEventSchema>;

/**
 * Task processing started
 */
export const TaskStartedEventSchema = z.object({
  taskId: z.string(),
  source: z.string(),
  chatId: z.string().optional(),
  mode: z.enum(["FAST", "SMART"]),
});

export type TaskStartedEvent = z.infer<typeof TaskStartedEventSchema>;

/**
 * Task progress update
 */
export const TaskProgressEventSchema = z.object({
  taskId: z.string(),
  source: z.string(),
  chatId: z.string().optional(),
  message: z.string(),
  /** Progress percentage (0-100) */
  percent: z.number().min(0).max(100).optional(),
  /** Current step name */
  step: z.string().optional(),
});

export type TaskProgressEvent = z.infer<typeof TaskProgressEventSchema>;

/**
 * Tool was called
 */
export const TaskToolCalledEventSchema = z.object({
  taskId: z.string(),
  source: z.string(),
  chatId: z.string().optional(),
  tool: z.string(),
  status: z.enum(["started", "success", "error"]),
  duration: z.number().optional(),
  error: z.string().optional(),
});

export type TaskToolCalledEvent = z.infer<typeof TaskToolCalledEventSchema>;

/**
 * Task completed successfully
 */
export const TaskCompletedEventSchema = z.object({
  taskId: z.string(),
  source: z.string(),
  chatId: z.string().optional(),
  /** The response to send back to the user */
  response: z.string(),
  /** Brief summary of what was done */
  summary: z.string().optional(),
  /** Duration in milliseconds */
  duration: z.number(),
  /** Tools that were used */
  toolsUsed: z.array(z.string()),
});

export type TaskCompletedEvent = z.infer<typeof TaskCompletedEventSchema>;

/**
 * Task failed
 */
export const TaskFailedEventSchema = z.object({
  taskId: z.string(),
  source: z.string(),
  chatId: z.string().optional(),
  error: z.string(),
  /** Whether the task can be retried */
  canRetry: z.boolean(),
});

export type TaskFailedEvent = z.infer<typeof TaskFailedEventSchema>;

/**
 * Response targeted at a specific interface
 * This is published when the agent wants to send a response
 */
export const AgentResponseEventSchema = z.object({
  taskId: z.string(),
  source: z.string(),
  chatId: z.string().optional(),
  /** Response text */
  text: z.string(),
  /** Optional image URL */
  imageUrl: z.string().optional(),
  /** Whether this is the final response */
  isFinal: z.boolean(),
});

export type AgentResponseEvent = z.infer<typeof AgentResponseEventSchema>;

// ============================================================================
// Event Type Constants
// ============================================================================

export const EVENT_TYPES = {
  // Incoming
  USER_MESSAGE: "user.message.received",

  // Outgoing
  TASK_CREATED: "agent.task.created",
  TASK_STARTED: "agent.task.started",
  TASK_PROGRESS: "agent.task.progress",
  TASK_TOOL_CALLED: "agent.task.tool_called",
  TASK_COMPLETED: "agent.task.completed",
  TASK_FAILED: "agent.task.failed",

  // Interface-specific responses (dynamically built)
  RESPONSE_PREFIX: "agent.response.",
} as const;

/**
 * Build the response event type for a specific interface
 */
export function getResponseEventType(source: string): string {
  return `${EVENT_TYPES.RESPONSE_PREFIX}${source}`;
}
