/**
 * Chat tools — 1-on-1 and group chats (Microsoft Teams private messages).
 */

import { createTool } from "@decocms/runtime/tools";
import z from "zod";
import type { Env } from "../types/env.ts";
import { getAccessToken } from "../lib/auth.ts";
import {
  listMyChats,
  getChatMembers,
  sendChatMessage,
  listChatMessages,
  findUserByEmail,
  searchUsers,
  getMyUserId,
  createOneOnOneChat,
  createGroupChat,
  editChatMessage,
  reactToChatMessage,
  buildChatMessageWebUrl,
  type ReactionType,
} from "../lib/graph-client.ts";
import { toErrorResponse } from "../lib/errors.ts";

async function token(env: Env): Promise<string> {
  return getAccessToken(env);
}

// ─── LIST_CHATS ─────────────────────────────────────────────────────────

export const createListChatsTool = (env: Env) =>
  createTool({
    id: "LIST_CHATS",
    description:
      "List all PRIVATE/GROUP CHATS the authenticated user is part of " +
      "(1-on-1, group, and meeting chats — NOT channels). " +
      "Each chat returns `{ id, topic, chat_type, last_updated, web_url }`. " +
      "For 1-on-1 chats with no explicit topic, `topic` is auto-filled with " +
      "the OTHER person's display name so you can identify them. " +
      "Use the `id` (format: `19:...@thread.v2`) as `chat_id` in " +
      "SEND_CHAT_MESSAGE / LIST_CHAT_MESSAGES. " +
      "Useful when the user says 'send a DM to X' and you need to find " +
      "the existing chat with X (otherwise create a new one with " +
      "GET_USER_BY_EMAIL + CREATE_PRIVATE_CHAT).",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z.object({}).strict(),
    outputSchema: z.object({
      success: z.boolean(),
      chats: z
        .array(
          z.object({
            id: z.string(),
            topic: z.string().nullish(),
            chat_type: z.string(),
            last_updated: z.string(),
            web_url: z.string().nullish(),
          }),
        )
        .optional(),
      error: z.string().nullish(),
      error_code: z.string().nullish(),
      error_hint: z.string().nullish(),
      request_id: z.string().nullish(),
    }),
    execute: async () => {
      try {
        const accessToken = await token(env);
        const myId = await getMyUserId(accessToken);
        const chats = await listMyChats(accessToken);
        return {
          success: true,
          chats: chats.map((c) => {
            // For 1-on-1 chats, derive a topic from the other member's name
            let topic = c.topic ?? null;
            if (!topic && c.chatType === "oneOnOne" && c.members) {
              const other = c.members.find(
                (m: any) => (m.userId ?? m.id) !== myId,
              );
              topic = other?.displayName ?? null;
            }
            return {
              id: c.id,
              topic,
              chat_type: c.chatType,
              last_updated: c.lastUpdatedDateTime,
              web_url: c.webUrl ?? null,
            };
          }),
        };
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  });

// ─── GET_CHAT_MEMBERS ───────────────────────────────────────────────────

export const createGetChatMembersTool = (env: Env) =>
  createTool({
    id: "GET_CHAT_MEMBERS",
    description:
      "List the members of a chat (useful for 1-on-1 chats with no topic so you can identify who you are talking to).",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        chat_id: z.string().describe("Chat ID from LIST_CHATS."),
      })
      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      members: z
        .array(
          z.object({
            id: z.string(),
            display_name: z.string(),
            email: z.string().nullish(),
          }),
        )
        .optional(),
      error: z.string().nullish(),
      error_code: z.string().nullish(),
      error_hint: z.string().nullish(),
      request_id: z.string().nullish(),
    }),
    execute: async ({ context }: { context: unknown }) => {
      const { chat_id } = context as { chat_id: string };
      try {
        const accessToken = await token(env);
        const members = await getChatMembers(chat_id, accessToken);
        return {
          success: true,
          members: members.map((m) => ({
            id: m.id,
            display_name: m.displayName,
            email: m.email ?? null,
          })),
        };
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  });

// ─── SEND_CHAT_MESSAGE ──────────────────────────────────────────────────

export const createSendChatMessageTool = (env: Env) =>
  createTool({
    id: "SEND_CHAT_MESSAGE",
    description:
      "Send a message to an EXISTING chat (1-on-1 or group — NOT a channel). " +
      "Get `chat_id` from one of: LIST_CHATS (existing chats), " +
      "CREATE_PRIVATE_CHAT (new 1-on-1) or CREATE_GROUP_CHAT " +
      "(new group). " +
      "Pass `reply_to_message_id` to render the new message as a QUOTED " +
      "REPLY (the original is shown in a gray block above your text) — " +
      "useful in busy chats to make clear which message you are answering. " +
      "Get the id from LIST_CHAT_MESSAGES.",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        chat_id: z.string().describe("Chat ID. Required."),
        content: z.string().describe("Message text or HTML to send."),
        content_type: z
          .enum(["text", "html"])
          .default("text")
          .describe("Content type: 'text' (default) or 'html'."),
        reply_to_message_id: z
          .string()
          .optional()
          .describe(
            "Optional id of an earlier message in this chat to quote-reply to. " +
              "Get the id from LIST_CHAT_MESSAGES.",
          ),
      })
      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      message_id: z.string().nullish(),
      web_url: z.string().nullish(),
      error: z.string().nullish(),
      error_code: z.string().nullish(),
      error_hint: z.string().nullish(),
      request_id: z.string().nullish(),
    }),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        chat_id: string;
        content: string;
        content_type?: "text" | "html";
        reply_to_message_id?: string;
      };
      try {
        const accessToken = await token(env);
        const msg = await sendChatMessage(
          input.chat_id,
          input.content,
          input.content_type ?? "text",
          accessToken,
          input.reply_to_message_id,
        );
        const tenantId = process.env.MICROSOFT_TENANT_ID;
        return {
          success: true,
          message_id: msg.id,
          web_url:
            msg.webUrl ??
            buildChatMessageWebUrl(input.chat_id, msg.id, tenantId),
        };
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  });

// ─── LIST_CHAT_MESSAGES ─────────────────────────────────────────────────

export const createListChatMessagesTool = (env: Env) =>
  createTool({
    id: "LIST_CHAT_MESSAGES",
    description: "List recent messages from a Teams chat (useful for context).",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        chat_id: z.string().describe("Chat ID from LIST_CHATS."),
        top: z
          .number()
          .default(20)
          .describe("Max number of messages to return (default 20)."),
      })
      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      messages: z
        .array(
          z.object({
            id: z.string(),
            created_at: z.string(),
            sender_name: z.string().nullish(),
            text: z.string(),
          }),
        )
        .optional(),
      error: z.string().nullish(),
      error_code: z.string().nullish(),
      error_hint: z.string().nullish(),
      request_id: z.string().nullish(),
    }),
    execute: async ({ context }: { context: unknown }) => {
      const { chat_id, top } = context as { chat_id: string; top?: number };
      try {
        const accessToken = await token(env);
        const messages = await listChatMessages(
          chat_id,
          accessToken,
          top ?? 20,
        );
        return {
          success: true,
          messages: messages.map((m) => {
            const text =
              m.body.contentType === "text"
                ? m.body.content
                : m.body.content
                    .replace(/<[^>]+>/g, "")
                    .replace(/&nbsp;/g, " ")
                    .trim();
            return {
              id: m.id,
              created_at: m.createdDateTime,
              sender_name:
                m.from?.user?.displayName ??
                m.from?.application?.displayName ??
                null,
              text,
            };
          }),
        };
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  });

// ─── GET_USER_BY_EMAIL ──────────────────────────────────────────────────────────

export const createFindUserTool = (env: Env) =>
  createTool({
    id: "GET_USER_BY_EMAIL",
    description:
      "Look up a user in the Azure AD directory by email or user-principal-name. " +
      "Returns their AAD id. Use this to get the id needed by CREATE_PRIVATE_CHAT " +
      "or CREATE_GROUP_CHAT.",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        email: z
          .string()
          .describe("Email or user-principal-name of the person to find."),
      })
      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      user: z
        .object({
          id: z.string(),
          display_name: z.string(),
          user_principal_name: z.string(),
          email: z.string().nullish(),
        })
        .nullish(),
      error: z.string().nullish(),
      error_code: z.string().nullish(),
      error_hint: z.string().nullish(),
      request_id: z.string().nullish(),
    }),
    execute: async ({ context }: { context: unknown }) => {
      const { email } = context as { email: string };
      try {
        const accessToken = await token(env);
        const user = await findUserByEmail(email, accessToken);
        if (!user) {
          return { success: false, error: `User not found: ${email}` };
        }
        return {
          success: true,
          user: {
            id: user.id,
            display_name: user.displayName,
            user_principal_name: user.userPrincipalName,
            email: user.mail ?? null,
          },
        };
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  });

// ─── SEARCH_USERS_BY_NAME ───────────────────────────────────────────────────────

export const createSearchUsersTool = (env: Env) =>
  createTool({
    id: "SEARCH_USERS_BY_NAME",
    description:
      "Search the directory for people by NAME (or partial name/email) when you " +
      "don't know the exact email. Returns up to `top` matches with their email " +
      "and AAD id. Use this to resolve 'send a message to João Silva' into an " +
      "actual address, then pass the email to GET_USER_BY_EMAIL / CREATE_PRIVATE_CHAT / " +
      "CREATE_MEETING. If multiple people match, present the options to the user.",
    annotations: {
      destructiveHint: false,
      openWorldHint: true,
      readOnlyHint: true,
    },
    inputSchema: z
      .object({
        query: z
          .string()
          .describe("Name or partial name/email to search for, e.g. 'Joao'."),
        top: z
          .number()
          .default(10)
          .describe("Max matches to return (default 10)."),
      })
      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      users: z
        .array(
          z.object({
            id: z.string(),
            display_name: z.string(),
            user_principal_name: z.string(),
            email: z.string().nullish(),
          }),
        )
        .optional(),
      error: z.string().nullish(),
      error_code: z.string().nullish(),
      error_hint: z.string().nullish(),
      request_id: z.string().nullish(),
    }),
    execute: async ({ context }: { context: unknown }) => {
      const { query, top } = context as { query: string; top?: number };
      try {
        const accessToken = await token(env);
        const users = await searchUsers(query, accessToken, top ?? 10);
        return {
          success: true,
          users: users.map((u) => ({
            id: u.id,
            display_name: u.displayName,
            user_principal_name: u.userPrincipalName,
            email: u.mail ?? null,
          })),
        };
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  });

// ─── CREATE_PRIVATE_CHAT ────────────────────────────────────────────────

export const createCreatePrivateChatTool = (env: Env) =>
  createTool({
    id: "CREATE_PRIVATE_CHAT",
    description:
      "Open a 1-on-1 private chat with another user. Microsoft Graph deduplicates: " +
      "calling this with the same user returns the existing chat. " +
      "Returns the chat_id to use with SEND_CHAT_MESSAGE. " +
      "Pass the other user's Azure AD id (from GET_USER_BY_EMAIL).",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        user_id: z
          .string()
          .describe(
            "Azure AD id of the other user (obtained from GET_USER_BY_EMAIL).",
          ),
      })
      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      chat_id: z.string().nullish(),
      web_url: z.string().nullish(),
      error: z.string().nullish(),
      error_code: z.string().nullish(),
      error_hint: z.string().nullish(),
      request_id: z.string().nullish(),
    }),
    execute: async ({ context }: { context: unknown }) => {
      const { user_id } = context as { user_id: string };
      try {
        const accessToken = await token(env);
        const myId = await getMyUserId(accessToken);
        const chat = await createOneOnOneChat(myId, user_id, accessToken);
        return {
          success: true,
          chat_id: chat.id,
          web_url: chat.webUrl ?? null,
        };
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  });

// ─── CREATE_GROUP_CHAT ──────────────────────────────────────────────────

export const createCreateGroupChatTool = (env: Env) =>
  createTool({
    id: "CREATE_GROUP_CHAT",
    description:
      "Create a NEW group chat with 3 or more people (you + 2+ others). " +
      "Workflow: call GET_USER_BY_EMAIL for each invitee's email to get their " +
      "AAD ids, then pass them here as `user_ids` (array) with a `topic` " +
      "(the chat's display name). Returns `chat_id` to use with " +
      "SEND_CHAT_MESSAGE. " +
      "If you only have 1 other person, use CREATE_PRIVATE_CHAT " +
      "(1-on-1 instead). " +
      "`user_ids` accepts both array (`[id1, id2]`) and comma-separated " +
      "string (`'id1,id2'`) for LLM convenience.",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        user_ids: z
          .preprocess((val) => {
            if (typeof val === "string") {
              return val
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            }
            return val;
          }, z.array(z.string()).min(2))
          .describe(
            "Azure AD ids of the other members (at least 2 — you are added automatically). Accepts an array of ids or a comma-separated string.",
          ),
        topic: z.string().describe("Display name / topic of the group chat."),
      })
      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      chat_id: z.string().nullish(),
      web_url: z.string().nullish(),
      error: z.string().nullish(),
      error_code: z.string().nullish(),
      error_hint: z.string().nullish(),
      request_id: z.string().nullish(),
    }),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as { user_ids: string[]; topic: string };
      try {
        const accessToken = await token(env);
        const myId = await getMyUserId(accessToken);
        const chat = await createGroupChat(
          myId,
          input.user_ids,
          input.topic,
          accessToken,
        );
        return {
          success: true,
          chat_id: chat.id,
          web_url: chat.webUrl ?? null,
        };
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  });

// ─── EDIT_CHAT_MESSAGE ──────────────────────────────────────────────────

export const createEditChatMessageTool = (env: Env) =>
  createTool({
    id: "EDIT_CHAT_MESSAGE",
    description:
      "Edit a chat message you previously sent. Teams shows an 'Edited' label.",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        chat_id: z.string().describe("Chat ID."),
        message_id: z.string().describe("ID of the message to edit."),
        content: z.string().describe("New message text or HTML."),
        content_type: z
          .enum(["text", "html"])
          .default("text")
          .describe("Content type."),
      })
      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      error: z.string().nullish(),
      error_code: z.string().nullish(),
      error_hint: z.string().nullish(),
      request_id: z.string().nullish(),
    }),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        chat_id: string;
        message_id: string;
        content: string;
        content_type?: "text" | "html";
      };
      try {
        const accessToken = await token(env);
        await editChatMessage(
          input.chat_id,
          input.message_id,
          input.content,
          input.content_type ?? "text",
          accessToken,
        );
        return { success: true };
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  });

// ─── REACT_TO_CHAT_MESSAGE ──────────────────────────────────────────────

export const createReactToChatMessageTool = (env: Env) =>
  createTool({
    id: "REACT_TO_CHAT_MESSAGE",
    description:
      "Add an emoji reaction to a chat message. " +
      "Allowed: like, heart, laugh, surprised, sad, angry.",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        chat_id: z.string().describe("Chat ID."),
        message_id: z.string().describe("ID of the message to react to."),
        reaction: z
          .enum(["like", "heart", "laugh", "surprised", "sad", "angry"])
          .describe("Reaction emoji."),
      })
      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      error: z.string().nullish(),
      error_code: z.string().nullish(),
      error_hint: z.string().nullish(),
      request_id: z.string().nullish(),
    }),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        chat_id: string;
        message_id: string;
        reaction: ReactionType;
      };
      try {
        const accessToken = await token(env);
        await reactToChatMessage(
          input.chat_id,
          input.message_id,
          input.reaction,
          accessToken,
        );
        return { success: true };
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  });

export const chatTools = [
  createListChatsTool,
  createGetChatMembersTool,
  createSendChatMessageTool,
  createListChatMessagesTool,
  createFindUserTool,
  createSearchUsersTool,
  createCreatePrivateChatTool,
  createCreateGroupChatTool,
  createEditChatMessageTool,
  createReactToChatMessageTool,
];
