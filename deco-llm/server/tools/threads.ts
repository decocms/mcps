/**
 * Thread Management Tools
 *
 * Tools for saving and retrieving thread conversations with LLM context.
 * Ensures messages are always saved in pairs (user -> assistant) to maintain
 * valid conversation state for LLM APIs.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { runSQL } from "../db/postgres.ts";

// ============================================================================
// Types
// ============================================================================

interface ThreadRow {
  id: string;
  created_at: string;
  updated_at: string;
  metadata: string | null;
  title: string | null;
  status: string;
}

interface MessageRow {
  id: string;
  thread_id: string;
  role: string;
  content: string;
  created_at: string;
  metadata: string | null;
  tool_calls: string | null;
  tokens_used: number;
  model: string | null;
  finish_reason: string | null;
}

// ============================================================================
// Tool: SAVE_THREAD_DATA
// ============================================================================

const SaveThreadDataInputSchema = z.object({
  threadId: z.string().optional(),
  title: z.string().optional(),
  status: z.enum(["active", "archived", "deleted"]).optional(),
  threadMetadata: z.record(z.string(), z.unknown()).optional(),
  userContent: z.string().describe("The user's message content"),
  assistantContent: z.string().describe("The assistant's response content"),
  assistantMetadata: z.record(z.string(), z.unknown()).optional(),
  toolCalls: z.array(z.unknown()).optional(),
  tokensUsed: z.number().optional(),
  model: z.string().optional(),
  finishReason: z.string().optional(),
});

const SaveThreadDataOutputSchema = z.object({
  threadId: z.string(),
  userMessageId: z.string(),
  assistantMessageId: z.string(),
});

/**
 * SAVE_THREAD_DATA - Saves a conversation turn (user + assistant pair) to a thread
 *
 * Always saves messages in pairs to maintain valid LLM conversation state.
 * Creates a new thread if threadId is not provided.
 */
export const createSaveThreadDataTool = (env: Env) =>
  createPrivateTool({
    id: "SAVE_THREAD_DATA",
    description:
      "Save a conversation turn (user message + assistant response) to a thread. " +
      "Creates a new thread if threadId is not provided. Always saves messages in pairs " +
      "to ensure valid conversation state for LLM APIs.",
    inputSchema: SaveThreadDataInputSchema,
    outputSchema: SaveThreadDataOutputSchema,
    execute: async ({ context }: { context: z.infer<typeof SaveThreadDataInputSchema> }) => {
      const {
        threadId: providedThreadId,
        title,
        status = "active",
        threadMetadata,
        userContent,
        assistantContent,
        assistantMetadata,
        toolCalls,
        tokensUsed,
        model,
        finishReason,
      } = context;

      // Generate IDs
      const finalThreadId = providedThreadId ?? crypto.randomUUID();
      const userMessageId = crypto.randomUUID();
      const assistantMessageId = crypto.randomUUID();

      // Serialize metadata and tool calls to JSON strings
      const threadMetadataJson = threadMetadata
        ? JSON.stringify(threadMetadata)
        : null;
      const assistantMetadataJson = assistantMetadata
        ? JSON.stringify(assistantMetadata)
        : null;
      const toolCallsJson = toolCalls ? JSON.stringify(toolCalls) : null;

      // Execute atomic transaction: upsert thread + insert 2 messages
      // Using a single SQL statement with CTE to ensure atomicity
      await runSQL(
        env,
        `
        WITH thread_upsert AS (
          INSERT INTO threads (id, title, status, metadata, created_at, updated_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO UPDATE SET
            updated_at = CURRENT_TIMESTAMP,
            title = CASE WHEN EXCLUDED.title IS NOT NULL THEN EXCLUDED.title ELSE threads.title END,
            status = CASE WHEN EXCLUDED.status IS NOT NULL THEN EXCLUDED.status ELSE threads.status END,
            metadata = CASE WHEN EXCLUDED.metadata IS NOT NULL THEN EXCLUDED.metadata ELSE threads.metadata END
          RETURNING id
        )
        INSERT INTO messages (id, thread_id, role, content, metadata, tool_calls, tokens_used, model, finish_reason, created_at)
        VALUES
          (?, (SELECT id FROM thread_upsert), 'user', ?, NULL, NULL, 0, NULL, NULL, CURRENT_TIMESTAMP),
          (?, (SELECT id FROM thread_upsert), 'assistant', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `,
        [
          finalThreadId,
          title ?? null,
          status,
          threadMetadataJson,
          userMessageId,
          userContent,
          assistantMessageId,
          assistantContent,
          assistantMetadataJson,
          toolCallsJson,
          tokensUsed ?? 0,
          model ?? null,
          finishReason ?? null,
        ],
      );

      return {
        threadId: finalThreadId,
        userMessageId,
        assistantMessageId,
      };
    },
  });

// ============================================================================
// Tool: RETRIEVE_THREAD_DATA
// ============================================================================

const RetrieveThreadDataInputSchema = z.object({
  threadId: z.string().describe("The ID of the thread to retrieve"),
  limitPairs: z.number().optional().describe("Maximum number of message pairs to return"),
  offsetPairs: z.number().optional().describe("Number of message pairs to skip"),
});

const RetrieveThreadDataOutputSchema = z.object({
  thread: z.object({
    id: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    title: z.string().nullable(),
    status: z.string(),
  }),
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.string(),
      content: z.string(),
      created_at: z.string(),
      metadata: z.record(z.string(), z.unknown()).nullable(),
      tool_calls: z.array(z.unknown()).nullable(),
      tokens_used: z.number(),
      model: z.string().nullable(),
      finish_reason: z.string().nullable(),
    }),
  ),
});

/**
 * RETRIEVE_THREAD_DATA - Retrieves a thread and its messages
 *
 * Returns messages ordered by creation time, ensuring they start with 'user'
 * and alternate in pairs. If there's an odd number of messages (legacy data),
 * the last message is discarded to maintain pair integrity.
 */
export const createRetrieveThreadDataTool = (env: Env) =>
  createPrivateTool({
    id: "RETRIEVE_THREAD_DATA",
    description:
      "Retrieve a thread and all its messages ordered by creation time. " +
      "Messages are returned in pairs (user -> assistant) suitable for LLM context. " +
      "If there's an odd number of messages, the last one is discarded.",
    inputSchema: RetrieveThreadDataInputSchema,
    outputSchema: RetrieveThreadDataOutputSchema,
    execute: async ({ context }: { context: z.infer<typeof RetrieveThreadDataInputSchema> }) => {
      const { threadId, limitPairs, offsetPairs = 0 } = context;

      // Fetch thread
      const threads = await runSQL<ThreadRow>(
        env,
        `SELECT * FROM threads WHERE id = ?`,
        [threadId],
      );

      if (threads.length === 0) {
        throw new Error(`Thread with id ${threadId} not found`);
      }

      const thread = threads[0];

      // Fetch messages ordered by creation time
      let messagesQuery = `
        SELECT * FROM messages
        WHERE thread_id = ?
        ORDER BY created_at ASC
      `;

      const queryParams: unknown[] = [threadId];

      // Apply pagination if specified (limitPairs means limit message pairs, so multiply by 2)
      if (limitPairs !== undefined) {
        messagesQuery += ` LIMIT ?`;
        queryParams.push(limitPairs * 2);
      }

      if (offsetPairs > 0) {
        messagesQuery += ` OFFSET ?`;
        queryParams.push(offsetPairs * 2);
      }

      const messageRows = await runSQL<MessageRow>(env, messagesQuery, queryParams);

      // Parse JSON fields and transform to output format
      const messages = messageRows.map((row) => ({
        id: row.id,
        role: row.role,
        content: row.content,
        created_at: row.created_at,
        metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : null,
        tool_calls: row.tool_calls ? (JSON.parse(row.tool_calls) as unknown[]) : null,
        tokens_used: row.tokens_used,
        model: row.model,
        finish_reason: row.finish_reason,
      }));

      // Ensure messages start with 'user' and are in pairs
      // If first message is not 'user', discard it
      let validMessages = messages;
      if (validMessages.length > 0 && validMessages[0].role !== "user") {
        validMessages = validMessages.slice(1);
      }

      // Ensure even number of messages (discard last if odd)
      if (validMessages.length % 2 !== 0) {
        validMessages = validMessages.slice(0, -1);
      }

      // Parse thread metadata
      const threadMetadata = thread.metadata
        ? (JSON.parse(thread.metadata) as Record<string, unknown>)
        : null;

      return {
        thread: {
          id: thread.id,
          created_at: thread.created_at,
          updated_at: thread.updated_at,
          metadata: threadMetadata,
          title: thread.title,
          status: thread.status,
        },
        messages: validMessages,
      };
    },
  });
