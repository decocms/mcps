import { messageTools } from "./messages.ts";
import { chatTools } from "./chats.ts";
import { meetingTools } from "./meetings.ts";
import { eventTools } from "./events.ts";
import { subscriptionTools } from "./subscriptions.ts";
import { triggers } from "../lib/trigger-store.ts";

export const tools = [
  // Channel tools (SEND_MESSAGE, LIST_TEAMS, etc.)
  ...messageTools,
  // Chat tools (SEND_CHAT_MESSAGE, GET_USER_BY_EMAIL, etc.)
  ...chatTools,
  // Meeting tools (CREATE_MEETING, RESCHEDULE_MEETING, ACCEPT/DECLINE, etc.)
  ...meetingTools,
  // Webhook subscription lifecycle (agent-driven)
  ...subscriptionTools,
  // Event diagnostics (GET_RECENT_EVENTS, CLEAR_RECENT_EVENTS)
  ...eventTools,
  // Trigger tools (register/unregister teams.message.received)
  () => triggers.tools(),
];
