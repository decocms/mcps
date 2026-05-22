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

  // Action endpoints (e.g. /cancel, /accept, /decline, setReaction) return
  // 202/204 with an empty body. Read as text and only JSON-parse when there
  // is content, so empty-body successes don't throw on response.json().
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
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

/** List top-level messages of a channel (newest first by default). */
export async function listChannelMessages(
  teamId: string,
  channelId: string,
  accessToken: string,
  top = 20,
  expandReplies = false,
): Promise<(GraphMessage & { replies?: GraphMessage[] })[]> {
  const expand = expandReplies ? "&$expand=replies" : "";
  const data = await graphFetch<{
    value: (GraphMessage & { replies?: GraphMessage[] })[];
  }>(
    `${GRAPH}/teams/${teamId}/channels/${channelId}/messages?$top=${top}${expand}`,
    accessToken,
  );
  return data.value ?? [];
}

// ─── Edit / Delete / React (channel + chat) ──────────────────────────────────

export async function editChannelMessage(
  teamId: string,
  channelId: string,
  messageId: string,
  content: string,
  contentType: "text" | "html",
  accessToken: string,
): Promise<void> {
  await graphFetch<void>(
    `${GRAPH}/teams/${teamId}/channels/${channelId}/messages/${messageId}`,
    accessToken,
    {
      method: "PATCH",
      body: JSON.stringify({ body: { contentType, content } }),
    },
  );
}

export async function editChatMessage(
  chatId: string,
  messageId: string,
  content: string,
  contentType: "text" | "html",
  accessToken: string,
): Promise<void> {
  await graphFetch<void>(
    `${GRAPH}/chats/${chatId}/messages/${messageId}`,
    accessToken,
    {
      method: "PATCH",
      body: JSON.stringify({ body: { contentType, content } }),
    },
  );
}

export type ReactionType =
  | "like"
  | "heart"
  | "laugh"
  | "surprised"
  | "sad"
  | "angry";

/**
 * Graph setReaction requires the Unicode emoji as `reactionType`, not the
 * friendly name. We accept both: callers pass a friendly name and we map
 * it to the emoji before sending.
 */
const REACTION_EMOJI: Record<ReactionType, string> = {
  like: "👍",
  heart: "❤️",
  laugh: "😂",
  surprised: "😮",
  sad: "😢",
  angry: "😡",
};

export async function reactToChannelMessage(
  teamId: string,
  channelId: string,
  messageId: string,
  reactionType: ReactionType,
  accessToken: string,
): Promise<void> {
  await graphFetch<void>(
    `${GRAPH}/teams/${teamId}/channels/${channelId}/messages/${messageId}/setReaction`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({ reactionType: REACTION_EMOJI[reactionType] }),
    },
  );
}

export async function reactToChatMessage(
  chatId: string,
  messageId: string,
  reactionType: ReactionType,
  accessToken: string,
): Promise<void> {
  await graphFetch<void>(
    `${GRAPH}/chats/${chatId}/messages/${messageId}/setReaction`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({ reactionType: REACTION_EMOJI[reactionType] }),
    },
  );
}

/** Build a deep-link to a chat message (Graph doesn't return webUrl for chats). */
export function buildChatMessageWebUrl(
  chatId: string,
  messageId: string,
  tenantId?: string,
): string {
  const base = `https://teams.microsoft.com/l/message/${encodeURIComponent(chatId)}/${encodeURIComponent(messageId)}`;
  return tenantId ? `${base}?tenantId=${encodeURIComponent(tenantId)}` : base;
}

/** List the replies under a specific channel message (thread). */
export async function listMessageReplies(
  teamId: string,
  channelId: string,
  messageId: string,
  accessToken: string,
): Promise<GraphMessage[]> {
  const data = await graphFetch<{ value: GraphMessage[] }>(
    `${GRAPH}/teams/${teamId}/channels/${channelId}/messages/${messageId}/replies`,
    accessToken,
  );
  return data.value ?? [];
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
 * Search the directory for users by display name (or email fragment).
 * Uses Graph $search, which requires the ConsistencyLevel: eventual header.
 * Returns the best matches so the caller can resolve a name → email/id.
 */
export async function searchUsers(
  query: string,
  accessToken: string,
  top = 10,
): Promise<GraphUser[]> {
  // Escape backslashes and double quotes so they don't break the quoted
  // $search expression ("displayName:...") per Microsoft Graph search syntax.
  const safeQuery = query.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const search = encodeURIComponent(
    `"displayName:${safeQuery}" OR "mail:${safeQuery}"`,
  );
  const url =
    `${GRAPH}/users?$search=${search}&$top=${top}` +
    `&$select=id,displayName,userPrincipalName,mail`;
  const data = await graphFetch<{ value: GraphUser[] }>(url, accessToken, {
    headers: { ConsistencyLevel: "eventual" },
  });
  return data.value ?? [];
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

/** Get a single chat message by id (used to build reply quote references). */
export async function getChatMessage(
  chatId: string,
  messageId: string,
  accessToken: string,
): Promise<GraphMessage | null> {
  try {
    return await graphFetch<GraphMessage>(
      `${GRAPH}/chats/${chatId}/messages/${messageId}`,
      accessToken,
    );
  } catch {
    return null;
  }
}

/**
 * Send a message to an existing chat.
 *
 * If `replyToMessageId` is provided, the original message is fetched and a
 * `messageReference` attachment is built so Teams renders the new message
 * as a "quoted reply" of the original (this is how chat replies work — chat
 * messages don't support the channel-style `replyToId` threading).
 */
export async function sendChatMessage(
  chatId: string,
  content: string,
  contentType: "text" | "html" = "text",
  accessToken: string,
  replyToMessageId?: string,
): Promise<GraphMessage> {
  // Simple path — no reply target
  if (!replyToMessageId) {
    return graphFetch<GraphMessage>(
      `${GRAPH}/chats/${chatId}/messages`,
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({ body: { contentType, content } }),
      },
    );
  }

  // Reply with quote — fetch the original and build the messageReference attachment
  const original = await getChatMessage(chatId, replyToMessageId, accessToken);
  if (!original) {
    throw new Error(
      `Cannot reply: message ${replyToMessageId} not found in chat ${chatId}`,
    );
  }

  const attachmentId = crypto.randomUUID();
  const senderUser = original.from?.user;
  const senderApp = original.from?.application;
  const sender = senderUser
    ? {
        application: null,
        device: null,
        user: {
          userIdentityType: "aadUser",
          id: senderUser.id,
          displayName: senderUser.displayName,
        },
      }
    : {
        application: senderApp
          ? {
              applicationIdentityType: "bot",
              id: senderApp.id,
              displayName: senderApp.displayName,
            }
          : null,
        device: null,
        user: null,
      };

  // Build a short preview from the original body
  const previewSource =
    original.body.contentType === "text"
      ? original.body.content
      : original.body.content
          .replace(/<[^>]+>/g, "")
          .replace(/&nbsp;/g, " ")
          .trim();
  const messagePreview = previewSource.slice(0, 120);

  // The body must reference the attachment inline
  const bodyContent = `<attachment id="${attachmentId}"></attachment>${
    contentType === "html"
      ? content
      : // Escape minimal HTML chars when wrapping plain text into HTML
        content
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
  }`;

  return graphFetch<GraphMessage>(
    `${GRAPH}/chats/${chatId}/messages`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        body: { contentType: "html", content: bodyContent },
        attachments: [
          {
            id: attachmentId,
            contentType: "messageReference",
            contentUrl: null,
            content: JSON.stringify({
              messageId: replyToMessageId,
              messagePreview,
              messageSender: sender,
            }),
            name: null,
            thumbnailUrl: null,
          },
        ],
      }),
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

// ─── Teams & Channels ─────────────────────────────────────────────────────────

export async function listJoinedTeams(
  accessToken: string,
): Promise<GraphTeam[]> {
  // /me/joinedTeams lists the teams the signed-in user is a member of.
  // (/teams lists all teams in the org and needs admin/app permissions.)
  const data = await graphFetch<{ value: GraphTeam[] }>(
    `${GRAPH}/me/joinedTeams`,
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

// ─── Calendar / Meetings ──────────────────────────────────────────────────────

export interface GraphDateTime {
  dateTime: string; // e.g. "2026-05-21T15:00:00"
  timeZone: string; // e.g. "America/Sao_Paulo" or "UTC"
}

export interface GraphAttendee {
  emailAddress: { address: string; name?: string };
  type?: "required" | "optional" | "resource";
  status?: { response?: string; time?: string };
}

export interface GraphEvent {
  id: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType: string; content: string };
  start?: GraphDateTime;
  end?: GraphDateTime;
  location?: { displayName?: string };
  attendees?: GraphAttendee[];
  organizer?: { emailAddress: { address: string; name?: string } };
  isOnlineMeeting?: boolean;
  onlineMeeting?: { joinUrl?: string };
  webLink?: string;
  isCancelled?: boolean;
  responseStatus?: { response?: string; time?: string };
}

export interface CreateEventInput {
  subject: string;
  start: GraphDateTime;
  end: GraphDateTime;
  attendees?: { address: string; name?: string; optional?: boolean }[];
  bodyHtml?: string;
  locationName?: string;
  isOnlineMeeting?: boolean;
}

function buildAttendees(
  attendees?: { address: string; name?: string; optional?: boolean }[],
): GraphAttendee[] | undefined {
  if (!attendees?.length) return undefined;
  return attendees.map((a) => ({
    emailAddress: { address: a.address, name: a.name },
    type: a.optional ? "optional" : "required",
  }));
}

/** List calendar events / meetings within an optional time window. */
export async function listEvents(
  accessToken: string,
  opts: { start?: string; end?: string; top?: number } = {},
): Promise<GraphEvent[]> {
  const top = opts.top ?? 20;
  // Use calendarView when a window is given (expands recurrences), else /events
  if (opts.start && opts.end) {
    const url =
      `${GRAPH}/me/calendarView?startDateTime=${encodeURIComponent(opts.start)}` +
      `&endDateTime=${encodeURIComponent(opts.end)}&$top=${top}&$orderby=start/dateTime`;
    const data = await graphFetch<{ value: GraphEvent[] }>(url, accessToken);
    return data.value ?? [];
  }
  const data = await graphFetch<{ value: GraphEvent[] }>(
    `${GRAPH}/me/events?$top=${top}&$orderby=start/dateTime`,
    accessToken,
  );
  return data.value ?? [];
}

export async function getEvent(
  eventId: string,
  accessToken: string,
): Promise<GraphEvent | null> {
  try {
    return await graphFetch<GraphEvent>(
      `${GRAPH}/me/events/${eventId}`,
      accessToken,
    );
  } catch {
    return null;
  }
}

/** Create a calendar event. Set isOnlineMeeting to attach a Teams join link. */
export async function createEvent(
  input: CreateEventInput,
  accessToken: string,
): Promise<GraphEvent> {
  const payload: Record<string, unknown> = {
    subject: input.subject,
    start: input.start,
    end: input.end,
  };
  if (input.bodyHtml) {
    payload.body = { contentType: "HTML", content: input.bodyHtml };
  }
  if (input.locationName) {
    payload.location = { displayName: input.locationName };
  }
  const attendees = buildAttendees(input.attendees);
  if (attendees) payload.attendees = attendees;
  if (input.isOnlineMeeting) {
    payload.isOnlineMeeting = true;
    payload.onlineMeetingProvider = "teamsForBusiness";
  }

  return graphFetch<GraphEvent>(`${GRAPH}/me/events`, accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface UpdateEventInput {
  subject?: string;
  start?: GraphDateTime;
  end?: GraphDateTime;
  attendees?: { address: string; name?: string; optional?: boolean }[];
  bodyHtml?: string;
  locationName?: string;
}

/** Patch an event — used for editing details and rescheduling (start/end). */
export async function updateEvent(
  eventId: string,
  input: UpdateEventInput,
  accessToken: string,
): Promise<GraphEvent> {
  const payload: Record<string, unknown> = {};
  if (input.subject !== undefined) payload.subject = input.subject;
  if (input.start) payload.start = input.start;
  if (input.end) payload.end = input.end;
  if (input.bodyHtml !== undefined) {
    payload.body = { contentType: "HTML", content: input.bodyHtml };
  }
  if (input.locationName !== undefined) {
    payload.location = { displayName: input.locationName };
  }
  const attendees = buildAttendees(input.attendees);
  if (attendees) payload.attendees = attendees;

  return graphFetch<GraphEvent>(`${GRAPH}/me/events/${eventId}`, accessToken, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

/** Delete an event from the calendar (no cancellation notice sent). */
export async function deleteEvent(
  eventId: string,
  accessToken: string,
): Promise<void> {
  await graphFetch<void>(`${GRAPH}/me/events/${eventId}`, accessToken, {
    method: "DELETE",
  });
}

/**
 * Cancel an event you organize — sends a cancellation message to attendees.
 * Only valid for the organizer.
 */
export async function cancelEvent(
  eventId: string,
  comment: string | undefined,
  accessToken: string,
): Promise<void> {
  await graphFetch<void>(`${GRAPH}/me/events/${eventId}/cancel`, accessToken, {
    method: "POST",
    body: JSON.stringify(comment ? { comment } : {}),
  });
}

export type EventResponse = "accept" | "decline" | "tentativelyAccept";

/**
 * Respond to a meeting invitation. Optionally propose a new time
 * (decline / tentativelyAccept support proposedNewTime).
 */
export async function respondToEvent(
  eventId: string,
  response: EventResponse,
  accessToken: string,
  opts: {
    comment?: string;
    sendResponse?: boolean;
    proposedNewTime?: { start: GraphDateTime; end: GraphDateTime };
  } = {},
): Promise<void> {
  const payload: Record<string, unknown> = {
    sendResponse: opts.sendResponse ?? true,
  };
  if (opts.comment) payload.comment = opts.comment;
  if (opts.proposedNewTime && response !== "accept") {
    payload.proposedNewTime = {
      start: opts.proposedNewTime.start,
      end: opts.proposedNewTime.end,
    };
  }

  await graphFetch<void>(
    `${GRAPH}/me/events/${eventId}/${response}`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}
