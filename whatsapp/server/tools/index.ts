import { z } from "zod";
import { createTool } from "@decocms/runtime/tools";
import { runSQL, type Env } from "../main";
import { createCollectionBindings } from "@decocms/bindings/collections";

const listPhoneNumbers = (env: Env) =>
  createTool({
    id: "LIST_PHONE_NUMBERS",
    description: "List all phone numbers for the business account",
    inputSchema: z.object({}),
    execute: async () => {
      console.log({ env: env.MESH_REQUEST_CONTEXT.token });
      const state = env.MESH_REQUEST_CONTEXT.state;
      const config = {
        whatsAppAccessToken: state.whatsAppAccessToken,
        whatsAppBusinessAccountId: state.whatsAppBusinessAccountId,
      };
      const response = await fetch(
        `https://graph.facebook.com/v23.0/${config.whatsAppBusinessAccountId}/phone_numbers`,
        {
          headers: {
            Authorization: `Bearer ${config.whatsAppAccessToken}`,
          },
        },
      );
      return response.json();
    },
  });

const updatePhoneNumberWebhook = (env: Env) =>
  createTool({
    id: "UPDATE_PHONE_NUMBER_WEBHOOK",
    description: "Update the webhook for a phone number",
    inputSchema: z.object({
      phoneNumberId: z.string(),
      webhookUrl: z.string(),
    }),
    execute: async ({ context }) => {
      const state = env.MESH_REQUEST_CONTEXT.state;
      const config = {
        whatsAppAccessToken: state.whatsAppAccessToken,
        whatsAppBusinessAccountId: state.whatsAppBusinessAccountId,
      };
      const body = {
        webhook_configuration: {
          override_callback_uri: context.webhookUrl,
          verify_token: "677863",
        },
      };
      console.log({ config });
      const response = await fetch(
        `https://graph.facebook.com/v23.0/${context.phoneNumberId}`,
        {
          headers: {
            Authorization: `Bearer ${config.whatsAppAccessToken}`,
            "Content-Type": "application/json",
          },
          method: "POST",
          body: JSON.stringify(body),
        },
      );
      return response.json();
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
      console.log({ context });
      const state = env.MESH_REQUEST_CONTEXT.state;
      const config = {
        whatsAppAccessToken: state.whatsAppAccessToken,
        whatsAppBusinessAccountId: state.whatsAppBusinessAccountId,
      };
      const body = {
        cc: context.countryCode,
        phone_number: context.phoneNumber,
        verified_name: context.verifiedName,
      };
      console.log({ body });
      const response = await fetch(
        `https://graph.facebook.com/v23.0/${config.whatsAppBusinessAccountId}/phone_numbers`,
        {
          headers: {
            Authorization: `Bearer ${config.whatsAppAccessToken}`,
            "Content-Type": "application/json",
          },
          method: "POST",
          body: JSON.stringify(body),
        },
      );
      const data = (await response.json()) as unknown as { id: string };
      console.log({ data });
      return {
        id: data.id,
      };
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
        console.log({ context });
        const state = env.MESH_REQUEST_CONTEXT.state;
        const config = {
          whatsAppAccessToken: state.whatsAppAccessToken,
          whatsAppBusinessAccountId: state.whatsAppBusinessAccountId,
        };
        const url = new URL(
          `https://graph.facebook.com/v23.0/${context.phoneNumberId}/request_code`,
        );
        url.searchParams.append("code_method", context.codeMethod ?? "SMS");
        url.searchParams.append("language", context.language ?? "en_US");
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${config.whatsAppAccessToken}`,
          },
          method: "POST",
        });
        const data = (await response.json()) as unknown as { success: boolean };
        console.log({ data });
        return {
          success: data.success,
        };
      } catch (error) {
        console.error(error);
        return {
          success: false,
        };
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
        console.log({ context });
        const state = env.MESH_REQUEST_CONTEXT.state;
        const config = {
          whatsAppAccessToken: state.whatsAppAccessToken,
          whatsAppBusinessAccountId: state.whatsAppBusinessAccountId,
        };
        const url = new URL(
          `https://graph.facebook.com/v23.0/${context.phoneNumberId}/verify_code`,
        );
        url.searchParams.append("code", context.code);
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${config.whatsAppAccessToken}`,
          },
          method: "POST",
        });
        const data = (await response.json()) as unknown as { success: boolean };
        console.log({ data });
        return {
          success: data.success,
        };
      } catch (error) {
        console.error(error);
        return {
          success: false,
        };
      }
    },
  });

const registerPhoneNumber = (env: Env) =>
  createTool({
    id: "REGISTER_PHONE_NUMBER",
    description: "Registers a phone number for the business account",
    inputSchema: z.object({
      phoneNumberId: z.string(),
      pin: z.string(),
    }),
    outputSchema: z.object({
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      try {
        console.log({ context });
        const state = env.MESH_REQUEST_CONTEXT.state;
        const config = {
          whatsAppAccessToken: state.whatsAppAccessToken,
          whatsAppBusinessAccountId: state.whatsAppBusinessAccountId,
        };
        const body = {
          pin: context.pin,
          messaging_product: "whatsapp",
        };
        const response = await fetch(
          `https://graph.facebook.com/v23.0/${context.phoneNumberId}/register`,
          {
            headers: {
              Authorization: `Bearer ${config.whatsAppAccessToken}`,
              "Content-Type": "application/json",
            },
            method: "POST",
            body: JSON.stringify(body),
          },
        );
        const data = (await response.json()) as unknown as { success: boolean };
        console.log({ data });
        return {
          success: data.success,
        };
      } catch (error) {
        console.error(error);
        return {
          success: false,
        };
      }
    },
  });

export async function insertWebhookEvent(env: Env, data: unknown) {
  const result = await runSQL(
    env,
    `
      INSERT INTO webhook_events (id, data) VALUES ($1, $2)
      RETURNING id
    `,
    [crypto.randomUUID(), JSON.stringify(data)],
  );
  console.log({ result });
  return result;
}

const webhookEventsCollection = createCollectionBindings(
  "webhook_events",
  z.object({
    id: z.string(),
    data: z.any(),
    created_at: z.string(),
  }),
  {
    readOnly: true,
  },
);

const LIST_TOOL = webhookEventsCollection.find(
  (tool) => tool.name === "COLLECTION_WEBHOOK_EVENTS_LIST",
);

if (!LIST_TOOL) {
  throw new Error("COLLECTION_WEBHOOK_EVENTS_LIST tool not found");
}

const listWebhookEvents = (env: Env) =>
  createTool({
    id: LIST_TOOL.name,
    description: "List all webhook events",
    inputSchema: LIST_TOOL.inputSchema,
    outputSchema: LIST_TOOL.outputSchema,
    execute: async () => {
      const result = await runSQL(
        env,
        `
        SELECT * FROM webhook_events
      `,
      );
      const items = result.map((item: unknown) => ({
        id: (item as { id: string }).id,
        created_at: (item as { created_at: string }).created_at,
        data: (item as { data: unknown }).data,
      }));
      return {
        items,
        totalCount: items.length,
        hasMore: false,
      };
    },
  });

export const tools = [
  listPhoneNumbers,
  updatePhoneNumberWebhook,
  createPhoneNumber,
  requestCode,
  verifyCode,
  registerPhoneNumber,
  listWebhookEvents,
];
