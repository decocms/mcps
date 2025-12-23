import { z } from "zod";
import { createTool } from "@decocms/runtime/tools";
import { type Env } from "../main.ts";
import { WhatsAppAPIClient } from "../lib/client.ts";

const listPhoneNumbers = (env: Env) =>
  createTool({
    id: "LIST_PHONE_NUMBERS",
    description: "List all phone numbers for the business account",
    inputSchema: z.object({}),
    execute: async () => {
      const state = env.MESH_REQUEST_CONTEXT.state;
      const client = new WhatsAppAPIClient({
        accessToken: state.whatsAppAccessToken,
        businessAccountId: state.whatsAppBusinessAccountId,
      });
      return client.listPhoneNumbers();
    },
  });

const updatePhoneNumberWebhook = (env: Env) =>
  createTool({
    id: "UPDATE_PHONE_NUMBER_WEBHOOK",
    description: "Update the webhook for a phone number",
    inputSchema: z.object({
      phoneNumberId: z.string(),
      webhookUrl: z.string(),
      verifyToken: z.string(),
    }),
    execute: async ({ context }) => {
      const state = env.MESH_REQUEST_CONTEXT.state;
      const client = new WhatsAppAPIClient({
        accessToken: state.whatsAppAccessToken,
        businessAccountId: state.whatsAppBusinessAccountId,
      });
      return client.updateWebhook(context.phoneNumberId, {
        webhookUrl: context.webhookUrl,
        verifyToken: context.verifyToken,
      });
    },
  });

const createPhoneNumber = (env: Env) =>
  createTool({
    id: "CREATE_PHONE_NUMBER",
    description: "Creates a new phone number for the business account",
    inputSchema: z.object({
      countryCode: z.string(),
      phoneNumber: z.string(),
      verifiedName: z.string(),
    }),
    outputSchema: z.object({
      id: z.string(),
    }),
    execute: async ({ context }) => {
      const state = env.MESH_REQUEST_CONTEXT.state;
      const client = new WhatsAppAPIClient({
        accessToken: state.whatsAppAccessToken,
        businessAccountId: state.whatsAppBusinessAccountId,
      });
      return client.createPhoneNumber(context);
    },
  });

const requestCode = (env: Env) =>
  createTool({
    id: "REQUEST_CODE_FOR_PHONE_NUMBER",
    description:
      "Requests a verification code for a registered phone number on the WhatsApp Business Account.",
    inputSchema: z.object({
      codeMethod: z.enum(["SMS", "VOICE"]).default("SMS").optional(),
      language: z.string().default("en_US").optional(),
      phoneNumberId: z.string(),
    }),
    outputSchema: z.object({
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      try {
        const state = env.MESH_REQUEST_CONTEXT.state;
        const client = new WhatsAppAPIClient({
          accessToken: state.whatsAppAccessToken,
          businessAccountId: state.whatsAppBusinessAccountId,
        });
        return await client.requestCode(context.phoneNumberId, {
          codeMethod: context.codeMethod,
          language: context.language,
        });
      } catch (error) {
        console.error(error);
        return { success: false };
      }
    },
  });

const verifyCode = (env: Env) =>
  createTool({
    id: "VERIFY_CODE_FOR_PHONE_NUMBER",
    description:
      "Validates a verification code for a registered phone number on the WhatsApp Business Account.",
    inputSchema: z.object({
      code: z.string(),
      phoneNumberId: z.string(),
    }),
    outputSchema: z.object({
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      try {
        const state = env.MESH_REQUEST_CONTEXT.state;
        const client = new WhatsAppAPIClient({
          accessToken: state.whatsAppAccessToken,
          businessAccountId: state.whatsAppBusinessAccountId,
        });
        return await client.verifyCode(context.phoneNumberId, context.code);
      } catch (error) {
        console.error(error);
        return { success: false };
      }
    },
  });

const registerPhoneNumber = (env: Env) =>
  createTool({
    id: "REGISTER_PHONE_NUMBER",
    description: "Registers a phone number for the business account",
    inputSchema: z.object({
      phoneNumberId: z.string(),
      pin: z
        .string()
        .describe(
          "6-digit PIN for two-step verification. Obtained from the REQUEST_CODE_FOR_PHONE_NUMBER tool",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      const state = env.MESH_REQUEST_CONTEXT.state;
      try {
        const client = new WhatsAppAPIClient({
          accessToken: state.whatsAppAccessToken,
          businessAccountId: state.whatsAppBusinessAccountId,
        });
        const response = await client.registerPhoneNumber(
          context.phoneNumberId,
          context.pin,
        );
        return { success: response.success };
      } catch (error) {
        console.error(error);
        return { success: false };
      }
    },
  });

const updatePhoneNumberProfile = (env: Env) =>
  createTool({
    id: "UPDATE_PHONE_NUMBER_PROFILE",
    description: "Updates the profile for a phone number",
    inputSchema: z.object({
      phoneNumberId: z.string(),
      about: z.string().optional(),
      address: z.string().optional(),
      email: z.string().optional(),
      websites: z.array(z.string()).optional(),
      vertical: z
        .enum([
          "ALCOHOL",
          "APPAREL",
          "AUTO",
          "BEAUTY",
          "EDU",
          "ENTERTAIN",
          "EVENT_PLAN",
          "FINANCE",
          "GOVT",
          "GROCERY",
          "HEALTH",
          "HOTEL",
          "NONPROFIT",
          "ONLINE_GAMBLING",
          "OTC_DRUGS",
          "OTHER",
          "PHYSICAL_GAMBLING",
          "PROF_SERVICES",
          "RESTAURANT",
          "RETAIL",
          "TRAVEL",
        ])
        .optional(),
      profile_picture_handle: z.string().optional(),
    }),
    outputSchema: z.object({
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      const state = env.MESH_REQUEST_CONTEXT.state;
      const client = new WhatsAppAPIClient({
        accessToken: state.whatsAppAccessToken,
        businessAccountId: state.whatsAppBusinessAccountId,
      });
      return client.updatePhoneNumberProfile({
        phoneNumberId: context.phoneNumberId,
        about: context.about,
        address: context.address,
        email: context.email,
        websites: context.websites,
        profile_picture_handle: context.profile_picture_handle,
        vertical: context.vertical,
      });
    },
  });

export const phoneNumbersTools = [
  listPhoneNumbers,
  updatePhoneNumberWebhook,
  createPhoneNumber,
  requestCode,
  verifyCode,
  registerPhoneNumber,
  updatePhoneNumberProfile,
];
