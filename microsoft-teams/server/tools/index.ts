import { messageTools } from "./messages.ts";
import { chatTools } from "./chats.ts";
import { eventTools } from "./events.ts";
import { subscriptionTools } from "./subscriptions.ts";
import { triggers } from "../lib/trigger-store.ts";

export const tools = [
  // Channel tools (SEND_MESSAGE, LIST_TEAMS, etc.)
  ...messageTools,
  // Chat tools (SEND_CHAT_MESSAGE, FIND_USER, etc.)
  ...chatTools,
  // Webhook subscription lifecycle (agent-driven)
  ...subscriptionTools,
  // Event diagnostics (GET_RECENT_EVENTS, CLEAR_RECENT_EVENTS)
  ...eventTools,
  // Trigger tools (register/unregister teams.message.received)
  () => triggers.tools(),
];
