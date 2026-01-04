/**
 * HTTP client for interacting with the Discord API.
 *
 * Documentation: https://discord.com/developers/docs/intro
 */

import { makeApiRequest } from "@decocms/mcps-shared/tools/utils/api-client";

export interface DiscordClientConfig {
  botToken: string;
}

const DISCORD_API_URL = "https://discord.com/api/v10";

/**
 * Makes an authenticated request to the Discord API
 */
async function makeRequest(
  config: DiscordClientConfig,
  method: string,
  endpoint: string,
  body?: unknown,
  searchParams?: Record<string, string>,
): Promise<any> {
  let url = `${DISCORD_API_URL}${endpoint}`;

  if (searchParams) {
    const params = new URLSearchParams(searchParams);
    url += `?${params.toString()}`;
  }

  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bot ${config.botToken}`,
      "Content-Type": "application/json",
    },
  };

  if (body && (method === "POST" || method === "PATCH" || method === "PUT")) {
    options.body = JSON.stringify(body);
  }

  // For DELETE requests that return void, handle separately
  if (method === "DELETE" || method === "PUT") {
    const response = await fetch(url, options);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Discord API error: ${response.status} ${response.statusText}\n${errorText}`,
      );
    }
    // If response has content, parse it; otherwise return void
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return await response.json();
    }
    return;
  }

  return await makeApiRequest(url, options, "Discord");
}

/**
 * Creates a Discord client with all available methods
 */
export function createDiscordClient(config: DiscordClientConfig) {
  return {
    // Messages
    sendMessage: (channelId: string, body: unknown) =>
      makeRequest(config, "POST", `/channels/${channelId}/messages`, body),

    editMessage: (channelId: string, messageId: string, body: unknown) =>
      makeRequest(
        config,
        "PATCH",
        `/channels/${channelId}/messages/${messageId}`,
        body,
      ),

    deleteMessage: (channelId: string, messageId: string) =>
      makeRequest(
        config,
        "DELETE",
        `/channels/${channelId}/messages/${messageId}`,
      ),

    getMessage: (channelId: string, messageId: string) =>
      makeRequest(
        config,
        "GET",
        `/channels/${channelId}/messages/${messageId}`,
      ),

    getChannelMessages: (
      channelId: string,
      searchParams?: Record<string, string>,
    ) =>
      makeRequest(
        config,
        "GET",
        `/channels/${channelId}/messages`,
        undefined,
        searchParams,
      ),

    // Reactions
    addReaction: (channelId: string, messageId: string, emoji: string) =>
      makeRequest(
        config,
        "PUT",
        `/channels/${channelId}/messages/${messageId}/reactions/${emoji}/@me`,
      ),

    removeReaction: (channelId: string, messageId: string, emoji: string) =>
      makeRequest(
        config,
        "DELETE",
        `/channels/${channelId}/messages/${messageId}/reactions/${emoji}/@me`,
      ),

    getMessageReactions: (
      channelId: string,
      messageId: string,
      emoji: string,
      searchParams?: Record<string, string>,
    ) =>
      makeRequest(
        config,
        "GET",
        `/channels/${channelId}/messages/${messageId}/reactions/${emoji}`,
        undefined,
        searchParams,
      ),

    // Pins
    pinMessage: (channelId: string, messageId: string) =>
      makeRequest(config, "PUT", `/channels/${channelId}/pins/${messageId}`),

    unpinMessage: (channelId: string, messageId: string) =>
      makeRequest(config, "DELETE", `/channels/${channelId}/pins/${messageId}`),

    getPinnedMessages: (channelId: string) =>
      makeRequest(config, "GET", `/channels/${channelId}/pins`),

    // Channels
    createChannel: (guildId: string, body: unknown) =>
      makeRequest(config, "POST", `/guilds/${guildId}/channels`, body),

    getGuildChannels: (guildId: string) =>
      makeRequest(config, "GET", `/guilds/${guildId}/channels`),

    // Guilds
    listBotGuilds: (searchParams?: Record<string, string>) =>
      makeRequest(config, "GET", `/users/@me/guilds`, undefined, searchParams),

    getGuild: (guildId: string, searchParams?: Record<string, string>) =>
      makeRequest(config, "GET", `/guilds/${guildId}`, undefined, searchParams),

    getGuildMembers: (guildId: string, searchParams?: Record<string, string>) =>
      makeRequest(
        config,
        "GET",
        `/guilds/${guildId}/members`,
        undefined,
        searchParams,
      ),

    banMember: (guildId: string, userId: string, body?: unknown) =>
      makeRequest(config, "PUT", `/guilds/${guildId}/bans/${userId}`, body),

    // Roles
    createRole: (guildId: string, body: unknown) =>
      makeRequest(config, "POST", `/guilds/${guildId}/roles`, body),

    editRole: (guildId: string, roleId: string, body: unknown) =>
      makeRequest(config, "PATCH", `/guilds/${guildId}/roles/${roleId}`, body),

    deleteRole: (
      guildId: string,
      roleId: string,
      searchParams?: Record<string, string>,
    ) =>
      makeRequest(
        config,
        "DELETE",
        `/guilds/${guildId}/roles/${roleId}`,
        undefined,
        searchParams,
      ),

    getGuildRoles: (guildId: string) =>
      makeRequest(config, "GET", `/guilds/${guildId}/roles`),

    // Threads
    createThread: (channelId: string, body: unknown) =>
      makeRequest(config, "POST", `/channels/${channelId}/threads`, body),

    joinThread: (channelId: string) =>
      makeRequest(config, "PUT", `/channels/${channelId}/thread-members/@me`),

    leaveThread: (channelId: string) =>
      makeRequest(
        config,
        "DELETE",
        `/channels/${channelId}/thread-members/@me`,
      ),

    getActiveThreads: (guildId: string) =>
      makeRequest(config, "GET", `/guilds/${guildId}/threads/active`),

    getArchivedThreads: (
      channelId: string,
      type: "public" | "private",
      searchParams?: Record<string, string>,
    ) =>
      makeRequest(
        config,
        "GET",
        `/channels/${channelId}/threads/archived/${type}`,
        undefined,
        searchParams,
      ),

    // Webhooks
    createWebhook: (channelId: string, body: unknown) =>
      makeRequest(config, "POST", `/channels/${channelId}/webhooks`, body),

    executeWebhook: (
      webhookId: string,
      webhookToken: string,
      body: unknown,
      searchParams?: Record<string, string>,
    ) =>
      makeRequest(
        config,
        "POST",
        `/webhooks/${webhookId}/${webhookToken}`,
        body,
        searchParams,
      ),

    deleteWebhook: (webhookId: string, webhookToken: string) =>
      makeRequest(config, "DELETE", `/webhooks/${webhookId}/${webhookToken}`),

    listChannelWebhooks: (channelId: string) =>
      makeRequest(config, "GET", `/channels/${channelId}/webhooks`),

    listGuildWebhooks: (guildId: string) =>
      makeRequest(config, "GET", `/guilds/${guildId}/webhooks`),

    // Users
    getCurrentUser: () => makeRequest(config, "GET", `/users/@me`),

    getUser: (userId: string) => makeRequest(config, "GET", `/users/${userId}`),
  };
}
