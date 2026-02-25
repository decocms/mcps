/**
 * Slack File Tools
 *
 * Tools for uploading and managing files.
 */

import { createTool } from "@decocms/runtime/tools";
import z from "zod";
import type { Env } from "../types/env.ts";
import { uploadFile } from "../lib/slack-client.ts";

/**
 * Upload a file to a channel
 */
export const createUploadFileTool = (_env: Env) =>
  createTool({
    id: "SLACK_UPLOAD_FILE",
    description:
      "Upload a file or text content to a Slack channel. Can be used to share code snippets, documents, or any text content.",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        channel: z
          .string()
          .describe("Channel ID to upload the file to (e.g., C1234567890)"),
        content: z.string().describe("The text content of the file"),
        filename: z
          .string()
          .describe("Name of the file (e.g., 'report.txt', 'code.py')"),
        filetype: z
          .string()
          .optional()
          .describe(
            "File type/extension (e.g., 'python', 'javascript', 'text')",
          ),
        title: z.string().optional().describe("Title of the file"),
        initial_comment: z
          .string()
          .optional()
          .describe("Message to include with the file"),
        thread_ts: z
          .string()
          .optional()
          .describe("Thread timestamp to upload in a thread"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        file_id: z.string().optional().describe("ID of the uploaded file"),
        error: z.string().optional(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        channel: string;
        content: string;
        filename: string;
        filetype?: string;
        title?: string;
        initial_comment?: string;
        thread_ts?: string;
      };

      try {
        const result = await uploadFile({
          channels: [input.channel],
          content: input.content,
          filename: input.filename,
          filetype: input.filetype,
          title: input.title,
          initialComment: input.initial_comment,
          threadTs: input.thread_ts,
        });

        if (result.ok) {
          return {
            success: true,
            file_id: result.fileId,
          };
        }

        return {
          success: false,
          error: result.error ?? "Failed to upload file",
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

/**
 * Export all file tools
 */
export const fileTools = [createUploadFileTool];
