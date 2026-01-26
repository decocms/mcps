import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { ResendClient } from "../lib/client.ts";
import { getApiKey, getDefaultFrom } from "../lib/env.ts";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_WITH_NAME_REGEX = /^.+\s*<[^\s@]+@[^\s@]+\.[^\s@]+>$/;

const validateEmail = (email: string): boolean => {
  return EMAIL_REGEX.test(email) || EMAIL_WITH_NAME_REGEX.test(email);
};

const EmailSchema = z
  .string()
  .refine((email) => validateEmail(email), { message: "Invalid email format" });

const EmailOrArraySchema = z.union([
  EmailSchema,
  z.array(EmailSchema).min(1, "At least one email required"),
]);

export const createSendEmailTool = (env: Env) =>
  createPrivateTool({
    id: "send_email",
    description:
      "Send an email via Resend API. Supports HTML and plain text content, multiple recipients, and custom headers.",
    inputSchema: z
      .object({
        from: EmailSchema.optional().describe(
          "Sender email address. Can be 'Name <email@domain.com>' or just 'email@domain.com'. Falls back to configured default if not provided.",
        ),
        to: EmailOrArraySchema.describe(
          "Recipient email address(es). Can be a single email string or array of emails.",
        ),
        subject: z
          .string()
          .min(1, "Subject is required")
          .describe("Email subject line"),
        html: z.string().optional().describe("HTML content of the email"),
        text: z.string().optional().describe("Plain text content of the email"),
        bcc: EmailOrArraySchema.optional().describe(
          "Blind carbon copy recipient(s)",
        ),
        cc: EmailOrArraySchema.optional().describe("Carbon copy recipient(s)"),
        reply_to: EmailOrArraySchema.optional().describe(
          "Reply-to address(es)",
        ),
        headers: z
          .record(z.string(), z.string())
          .optional()
          .describe("Custom email headers (key-value pairs)"),
      })
      .refine((data) => data.html !== undefined || data.text !== undefined, {
        message: "At least one of 'html' or 'text' must be provided",
      }),
    outputSchema: z.object({
      data: z
        .object({
          id: z.string(),
        })
        .nullable(),
      error: z
        .object({
          message: z.string(),
          name: z.string(),
        })
        .nullable(),
    }),
    execute: async ({ context }) => {
      const client = new ResendClient({
        apiKey: getApiKey(env),
      });

      const from = context.from || getDefaultFrom(env);
      if (!from) {
        return {
          data: null,
          error: {
            name: "missing_required_field",
            message: "No 'from' address provided and no default configured",
          },
        };
      }

      const result = await client.sendEmail({
        from,
        to: context.to,
        subject: context.subject,
        html: context.html,
        text: context.text,
        bcc: context.bcc,
        cc: context.cc,
        reply_to: context.reply_to,
        headers: context.headers,
      });

      return result;
    },
  });

export const emailTools = [createSendEmailTool];
