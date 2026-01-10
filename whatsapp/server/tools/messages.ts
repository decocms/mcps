import { createTool } from "@decocms/runtime/tools";
import { WhatsAppAPIClient } from "server/lib/client";
import { z } from "zod";
import type { Env } from "server/main";

export async function sendTextMessage(
  env: Env,
  context: { phoneNumber: string; phoneNumberId: string; message: string },
) {
  const client = new WhatsAppAPIClient({
    accessToken: env.META_ACCESS_KEY,
    businessAccountId: env.META_BUSINESS_ACCOUNT_ID,
  });
  return client.sendTextMessage(
    context.phoneNumberId,
    context.phoneNumber,
    context.message,
  );
}

const sendTextMessageTool = (env: Env) =>
  createTool({
    id: "SEND_TEXT_MESSAGE",
    description: "Send a message to a WhatsApp user",
    inputSchema: z.object({
      phoneNumber: z
        .string()
        .describe("The target phone number to send the message to"),
      phoneNumberId: z
        .string()
        .describe(
          "The phone number ID of the phone that will send the message",
        ),
      message: z.string().describe("The message to send."),
    }),
    outputSchema: z.object({
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      const result = await sendTextMessage(env, context);
      return { success: !!result.messages[0].id };
    },
  });

export const messagesTools = [sendTextMessageTool];
