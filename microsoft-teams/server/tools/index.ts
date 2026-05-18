import { messageTools } from "./messages.ts";
import { chatTools } from "./chats.ts";
import { triggers } from "../lib/trigger-store.ts";

export const tools = [
  // Channel tools (TEAMS_SEND_MESSAGE, TEAMS_LIST_TEAMS, etc.)
  ...messageTools,
  // Chat tools (TEAMS_SEND_PRIVATE_MESSAGE, TEAMS_FIND_USER, etc.)
  ...chatTools,
  // Trigger tools (register/unregister teams.message.received)
  () => triggers.tools(),
];
