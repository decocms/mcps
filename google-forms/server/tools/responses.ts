/**
 * Response Tools
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { FormsClient, getAccessToken } from "../lib/forms-client.ts";

const ResponseSchema = z.object({
  responseId: z.string(),
  createTime: z.string(),
  lastSubmittedTime: z.string(),
  respondentEmail: z.string().optional(),
  answers: z.record(z.string(), z.any()),
});

export const createListResponsesTool = (env: Env) =>
  createPrivateTool({
    id: "list_responses",
    description: "List all responses for a form.",
    inputSchema: z.object({
      formId: z.string().describe("Form ID"),
    }),
    outputSchema: z.object({
      responses: z.array(ResponseSchema),
      count: z.number(),
    }),
    execute: async ({ context }) => {
      const client = new FormsClient({ accessToken: getAccessToken(env) });
      const responses = await client.listResponses(context.formId);
      return {
        responses: responses.map((r) => ({
          responseId: r.responseId,
          createTime: r.createTime,
          lastSubmittedTime: r.lastSubmittedTime,
          respondentEmail: r.respondentEmail,
          answers: Object.fromEntries(
            Object.entries(r.answers || {}).map(([qId, answer]) => [
              qId,
              answer.textAnswers?.answers?.map((a: any) => a.value) || [],
            ]),
          ),
        })),
        count: responses.length,
      };
    },
  });

export const createGetResponseTool = (env: Env) =>
  createPrivateTool({
    id: "get_response",
    description: "Get a specific response by ID.",
    inputSchema: z.object({
      formId: z.string().describe("Form ID"),
      responseId: z.string().describe("Response ID"),
    }),
    outputSchema: z.object({
      response: ResponseSchema,
    }),
    execute: async ({ context }) => {
      const client = new FormsClient({ accessToken: getAccessToken(env) });
      const r = await client.getResponse(context.formId, context.responseId);
      return {
        response: {
          responseId: r.responseId,
          createTime: r.createTime,
          lastSubmittedTime: r.lastSubmittedTime,
          respondentEmail: r.respondentEmail,
          answers: Object.fromEntries(
            Object.entries(r.answers || {}).map(([qId, answer]) => [
              qId,
              answer.textAnswers?.answers?.map((a: any) => a.value) || [],
            ]),
          ),
        },
      };
    },
  });

export const responseTools = [createListResponsesTool, createGetResponseTool];
