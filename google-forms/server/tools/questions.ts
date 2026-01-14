/**
 * Question Management Tools
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { FormsClient, getAccessToken } from "../lib/forms-client.ts";

export const createAddQuestionTool = (env: Env) =>
  createPrivateTool({
    id: "add_question",
    description: "Add a question to the form.",
    inputSchema: z.object({
      formId: z.string().describe("Form ID"),
      title: z.string().describe("Question text"),
      type: z
        .enum([
          "text",
          "paragraph",
          "radio",
          "checkbox",
          "dropdown",
          "scale",
          "date",
          "time",
        ])
        .describe("Question type"),
      choices: z
        .array(z.string())
        .optional()
        .describe("Options for radio/checkbox/dropdown"),
      required: z.boolean().optional().describe("Is the question required"),
      low: z.coerce.number().optional().describe("Scale low value (default 1)"),
      high: z.coerce
        .number()
        .optional()
        .describe("Scale high value (default 5)"),
      lowLabel: z.string().optional().describe("Scale low label"),
      highLabel: z.string().optional().describe("Scale high label"),
      index: z.coerce
        .number()
        .optional()
        .describe("Position to insert (0 = first)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new FormsClient({ accessToken: getAccessToken(env) });
      await client.addQuestion(
        context.formId,
        context.title,
        context.type,
        {
          choices: context.choices,
          required: context.required,
          low: context.low,
          high: context.high,
          lowLabel: context.lowLabel,
          highLabel: context.highLabel,
        },
        context.index,
      );
      return { success: true, message: `Question "${context.title}" added` };
    },
  });

export const createUpdateQuestionTool = (env: Env) =>
  createPrivateTool({
    id: "update_question",
    description: "Update a question's title or required status.",
    inputSchema: z.object({
      formId: z.string().describe("Form ID"),
      index: z.coerce.number().describe("Question index (0-based)"),
      title: z.string().optional().describe("New question text"),
      required: z.boolean().optional().describe("Is the question required"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new FormsClient({ accessToken: getAccessToken(env) });
      await client.updateQuestion(
        context.formId,
        context.index,
        context.title,
        context.required,
      );
      return { success: true, message: "Question updated" };
    },
  });

export const createDeleteQuestionTool = (env: Env) =>
  createPrivateTool({
    id: "delete_question",
    description: "Delete a question from the form.",
    inputSchema: z.object({
      formId: z.string().describe("Form ID"),
      index: z.coerce.number().describe("Question index (0-based)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new FormsClient({ accessToken: getAccessToken(env) });
      await client.deleteQuestion(context.formId, context.index);
      return { success: true, message: "Question deleted" };
    },
  });

export const questionTools = [
  createAddQuestionTool,
  createUpdateQuestionTool,
  createDeleteQuestionTool,
];
