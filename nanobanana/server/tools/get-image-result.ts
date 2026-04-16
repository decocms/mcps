import { z } from "zod";
import { createTool, ensureAuthenticated } from "@decocms/runtime/tools";
import type { Env } from "server/main.ts";
import { getTask } from "./utils/task-store.ts";

const createGetImageResultTool = (_env: Env) =>
  createTool({
    id: "get_image_result",
    description:
      "Check the status of an image generation request. Returns the current status and, when ready, the image URL. Poll this tool until status is 'Ready'. Stop polling if status is 'Error' or 'Task not found' — these are terminal failures.",
    inputSchema: z.object({
      request_id: z
        .string()
        .describe("The request ID returned by submit_image"),
    }),
    outputSchema: z.object({
      status: z
        .string()
        .describe(
          "Generation status: Pending, Ready, Error, or Task not found",
        ),
      image_url: z
        .string()
        .optional()
        .describe(
          "URL to the generated image (only present when status is Ready)",
        ),
      error: z
        .string()
        .optional()
        .describe("Error message (only present when status is Error)"),
    }),
    execute: async ({ context }, ctx) => {
      ensureAuthenticated(ctx!);
      const task = getTask(context.request_id);

      if (!task) {
        return { status: "Task not found" };
      }

      return {
        status: task.status,
        image_url: task.image_url,
        error: task.error,
      };
    },
  });

export const getImageResultTools = [createGetImageResultTool];
