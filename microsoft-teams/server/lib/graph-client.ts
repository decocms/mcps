/**
 * Microsoft Graph API client for Teams operations.
 *
 * All functions accept a pre-fetched accessToken — callers are responsible
 * for obtaining it via auth.ts::getAccessToken().
 */

const GRAPH = "https://graph.microsoft.com/v1.0";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GraphMessage {
  id: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  subject?: string;
  body: { contentType: "text" | "html"; content: string };
  from?: {
    user?: { id: string; displayName: string };
    application?: { id: string; displayName: string };
  };
  channelIdentity?: { teamId: string; channelId: string };
  replyToId?: string;
  webUrl?: string;
}

export interface GraphSubscription {
  id: string;
  resource: string;
  changeType: string;
  notificationUrl: string;
  expirationDateTime: string;
  clientState?: string;
}

export interface GraphTeam {
  id: string;
  displayName: string;
  description?: string;
}

export interface GraphChannel {
  id: string;
  displayName: string;
  description?: string;
  membershipType: string;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function graphFetch<T>(
  url: string,
  accessToken: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string> | undefined),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Graph API error ${response.status} ${url}: ${body}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function sendChannelMessage(
  teamId: string,
  channelId: string,
  content: string,
  contentType: "text" | "html" = "text",
  accessToken: string,
  subject?: string,
): Promise<GraphMessage> {
  const payload: Record<string, unknown> = {
    body: { contentType, content },
  };
  if (subject) payload.subject = subject;

  return graphFetch<GraphMessage>(
    `${GRAPH}/teams/${teamId}/channels/${channelId}/messages`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function replyToMessage(
  teamId: string,
  channelId: string,
  messageId: string,
  content: string,
  contentType: "text" | "html" = "text",
  accessToken: string,
): Promise<GraphMessage> {
  return graphFetch<GraphMessage>(
    `${GRAPH}/teams/${teamId}/channels/${channelId}/messages/${messageId}/replies`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({ body: { contentType, content } }),
    },
  );
}

export async function getMessage(
  teamId: string,
  channelId: string,
  messageId: string,
  accessToken: string,
): Promise<GraphMessage | null> {
  try {
    return await graphFetch<GraphMessage>(
      `${GRAPH}/teams/${teamId}/channels/${channelId}/messages/${messageId}`,
      accessToken,
    );
  } catch {
    return null;
  }
}

// ─── Users (directory lookup) ────────────────────────────────────────────────

export interface GraphUser {
  id: string;
  displayName: string;
  userPrincipalName: string;
  mail?: string;
}

/**
 * Look up a user by email / user-principal-name. Used to find someone's
 * Azure AD id before creating a 1-on-1 chat with them.
 */
export async function findUserByEmail(
  emailOrUpn: string,
  accessToken: string,
): Promise<GraphUser | null> {
  try {
    return await graphFetch<GraphUser>(
      `${GRAPH}/users/${encodeURIComponent(emailOrUpn)}`,
      accessToken,
    );
  } catch {
    return null;
  }
}

/**
 * Get the currently authenticated user's id (needed when creating chats —
 * the creator must be listed as one of the members).
 */
export async function getMyUserId(accessToken: string): Promise<string> {
  const me = await graphFetch<{ id: string }>(`${GRAPH}/me`, accessToken);
  return me.id;
}

// ─── Chats (1-on-1 and group) ────────────────────────────────────────────────

/**
 * Create (or fetch the existing) 1-on-1 chat between the authenticated user
 * and another user. Microsoft Graph deduplicates 1-on-1 chats by member set,
 * so calling this for an existing pair returns the same chat.
 */
export async function createOneOnOneChat(
  myUserId: string,
  otherUserId: string,
  accessToken: string,
): Promise<{ id: string; webUrl?: string }> {
  return graphFetch<{ id: string; webUrl?: string }>(
    `${GRAPH}/chats`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        chatType: "oneOnOne",
        members: [
          {
            "@odata.type": "#microsoft.graph.aadUserConversationMember",
            roles: ["owner"],
            "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${myUserId}')`,
          },
          {
            "@odata.type": "#microsoft.graph.aadUserConversationMember",
            roles: ["owner"],
            "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${otherUserId}')`,
          },
        ],
      }),
    },
  );
}

/**
 * Create a new group chat with multiple members (≥ 3 including yourself).
 */
export async function createGroupChat(
  myUserId: string,
  otherUserIds: string[],
  topic: string,
  accessToken: string,
): Promise<{ id: string; webUrl?: string }> {
  const members = [myUserId, ...otherUserIds].map((id) => ({
    "@odata.type": "#microsoft.graph.aadUserConversationMember",
    roles: ["owner"],
    "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${id}')`,
  }));

  return graphFetch<{ id: string; webUrl?: string }>(
    `${GRAPH}/chats`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        chatType: "group",
        topic,
        members,
      }),
    },
  );
}

export interface GraphChat {
  id: string;
  topic?: string | null;
  chatType: "oneOnOne" | "group" | "meeting";
  createdDateTime: string;
  lastUpdatedDateTime: string;
  webUrl?: string | null;
}

export interface GraphChatMember {
  id: string;
  displayName: string;
  email?: string;
}

/** List all chats the authenticated user is part of, with members expanded. */
export async function listMyChats(
  accessToken: string,
): Promise<(GraphChat & { members?: GraphChatMember[] })[]> {
  const data = await graphFetch<{
    value: (GraphChat & { members?: GraphChatMember[] })[];
  }>(`${GRAPH}/me/chats?$top=50&$expand=members`, accessToken);
  return data.value ?? [];
}

/** Get the members of a chat (to know who else is in it). */
export async function getChatMembers(
  chatId: string,
  accessToken: string,
): Promise<GraphChatMember[]> {
  const data = await graphFetch<{
    value: Array<{ id: string; displayName: string; email?: string }>;
  }>(`${GRAPH}/chats/${chatId}/members`, accessToken);
  return data.value ?? [];
}

/** Send a message to an existing chat. */
export async function sendChatMessage(
  chatId: string,
  content: string,
  contentType: "text" | "html" = "text",
  accessToken: string,
): Promise<GraphMessage> {
  return graphFetch<GraphMessage>(
    `${GRAPH}/chats/${chatId}/messages`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({ body: { contentType, content } }),
    },
  );
}

/** Get recent messages from a chat. */
export async function listChatMessages(
  chatId: string,
  accessToken: string,
  top = 20,
): Promise<GraphMessage[]> {
  const data = await graphFetch<{ value: GraphMessage[] }>(
    `${GRAPH}/chats/${chatId}/messages?$top=${top}`,
    accessToken,
  );
  return data.value ?? [];
}

// ─── Teams & Channels (requires admin consent — currently disabled) ──────────

export async function listJoinedTeams(
  accessToken: string,
): Promise<GraphTeam[]> {
  const data = await graphFetch<{ value: GraphTeam[] }>(
    `${GRAPH}/teams`,
    accessToken,
  );
  return data.value ?? [];
}

export async function listChannels(
  teamId: string,
  accessToken: string,
): Promise<GraphChannel[]> {
  const data = await graphFetch<{ value: GraphChannel[] }>(
    `${GRAPH}/teams/${teamId}/channels`,
    accessToken,
  );
  return data.value ?? [];
}

// ─── Graph Subscriptions ──────────────────────────────────────────────────────

/**
 * Creates a Graph change-notification subscription for channel messages.
 *
 * NOTE: For channel messages, the maximum expiration is 60 minutes.
 * The server renews automatically on each incoming notification.
 */
export async function createSubscription(
  notificationUrl: string,
  resource: string,
  clientState: string,
  accessToken: string,
  expirationMinutes = 58,
): Promise<GraphSubscription> {
  const expirationDateTime = new Date(
    Date.now() + expirationMinutes * 60 * 1000,
  ).toISOString();

  return graphFetch<GraphSubscription>(`${GRAPH}/subscriptions`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      changeType: "created",
      notificationUrl,
      resource,
      expirationDateTime,
      clientState,
    }),
  });
}

export async function renewSubscription(
  subscriptionId: string,
  accessToken: string,
  expirationMinutes = 58,
): Promise<GraphSubscription> {
  const expirationDateTime = new Date(
    Date.now() + expirationMinutes * 60 * 1000,
  ).toISOString();

  return graphFetch<GraphSubscription>(
    `${GRAPH}/subscriptions/${subscriptionId}`,
    accessToken,
    {
      method: "PATCH",
      body: JSON.stringify({ expirationDateTime }),
    },
  );
}

export async function deleteSubscription(
  subscriptionId: string,
  accessToken: string,
): Promise<void> {
  await graphFetch<void>(
    `${GRAPH}/subscriptions/${subscriptionId}`,
    accessToken,
    { method: "DELETE" },
  );
}
