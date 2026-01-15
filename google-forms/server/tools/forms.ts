/**
 * Form Management Tools
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { FormsClient, getAccessToken } from "../lib/forms-client.ts";

const FormSchema = z.object({
  formId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  responderUri: z.string().optional(),
  itemCount: z.number(),
});

export const createCreateFormTool = (env: Env) =>
  createPrivateTool({
    id: "create_form",
    description: "Create a new Google Form.",
    inputSchema: z.object({
      title: z.string().describe("Form title"),
    }),
    outputSchema: z.object({
      form: FormSchema,
      formLink: z.string(),
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      const client = new FormsClient({ accessToken: getAccessToken(env) });
      const form = await client.createForm(context.title);
      return {
        form: {
          formId: form.formId,
          title: form.info.title,
          description: form.info.description,
          responderUri: form.responderUri,
          itemCount: form.items?.length || 0,
        },
        formLink: form.responderUri || "",
        success: true,
      };
    },
  });

export const createGetFormTool = (env: Env) =>
  createPrivateTool({
    id: "get_form",
    description: "Get form details and questions.",
    inputSchema: z.object({
      formId: z.string().describe("Form ID"),
    }),
    outputSchema: z.object({
      form: FormSchema,
      items: z.array(
        z.object({
          itemId: z.string(),
          title: z.string().optional(),
          description: z.string().optional(),
          type: z.string(),
          required: z.boolean().optional(),
        }),
      ),
    }),
    execute: async ({ context }) => {
      const client = new FormsClient({ accessToken: getAccessToken(env) });
      const form = await client.getForm(context.formId);
      return {
        form: {
          formId: form.formId,
          title: form.info.title,
          description: form.info.description,
          responderUri: form.responderUri,
          itemCount: form.items?.length || 0,
        },
        items: (form.items || []).map((item) => {
          let type = "unknown";
          if (item.questionItem) {
            const q = item.questionItem.question;
            if (q.textQuestion)
              type = q.textQuestion.paragraph ? "paragraph" : "text";
            else if (q.choiceQuestion)
              type = q.choiceQuestion.type.toLowerCase();
            else if (q.scaleQuestion) type = "scale";
            else if (q.dateQuestion) type = "date";
            else if (q.timeQuestion) type = "time";
          } else if (item.pageBreakItem) {
            type = "page_break";
          } else if (item.textItem) {
            type = "text_block";
          } else if (item.imageItem) {
            type = "image";
          }
          return {
            itemId: item.itemId,
            title: item.title,
            description: item.description,
            type,
            required: item.questionItem?.question?.required,
          };
        }),
      };
    },
  });

export const createUpdateFormTool = (env: Env) =>
  createPrivateTool({
    id: "update_form",
    description: "Update form title or description.",
    inputSchema: z.object({
      formId: z.string().describe("Form ID"),
      title: z.string().optional().describe("New title"),
      description: z.string().optional().describe("New description"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new FormsClient({ accessToken: getAccessToken(env) });
      await client.updateFormInfo(
        context.formId,
        context.title,
        context.description,
      );
      return { success: true, message: "Form updated" };
    },
  });

export const createGetResponderUrlTool = (env: Env) =>
  createPrivateTool({
    id: "get_responder_url",
    description: "Get the URL where users can fill out the form.",
    inputSchema: z.object({
      formId: z.string().describe("Form ID"),
    }),
    outputSchema: z.object({
      responderUrl: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new FormsClient({ accessToken: getAccessToken(env) });
      const form = await client.getForm(context.formId);
      return { responderUrl: form.responderUri || "" };
    },
  });

export const formTools = [
  createCreateFormTool,
  createGetFormTool,
  createUpdateFormTool,
  createGetResponderUrlTool,
];
