import { replyTool } from "./actions.ts";
import { classifyTool, suggestReplyTool, summarizeTool } from "./ai.ts";
import {
  archiveConversationsTool,
  getConversationTool,
  listConversationsTool,
  statsTool,
  updateConversationTool,
} from "./conversations.ts";
import { addSourceTool, listSourcesTool, removeSourceTool } from "./sources.ts";

export const tools = [
  addSourceTool,
  listSourcesTool,
  removeSourceTool,
  listConversationsTool,
  getConversationTool,
  updateConversationTool,
  archiveConversationsTool,
  statsTool,
  replyTool,
  classifyTool,
  summarizeTool,
  suggestReplyTool,
];
