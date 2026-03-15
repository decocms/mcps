import {
  generateResponse,
  type ChatMessage,
  type MeshChatConfig,
} from "@decocms/mcps-shared/mesh-chat";
import type { Env } from "../types/env.ts";

function getMeshChatConfig(env: Env): MeshChatConfig | null {
  const ctx = env.MESH_REQUEST_CONTEXT;
  const state = ctx?.state;

  if (
    !ctx ||
    !ctx.meshUrl ||
    !state?.MODEL_PROVIDER ||
    !state?.LANGUAGE_MODEL
  ) {
    return null;
  }

  return {
    meshUrl: ctx.meshUrl,
    organizationId: ctx.organizationId ?? "",
    token: ctx.token ?? "",
    modelProviderId: state.LANGUAGE_MODEL.value.connectionId,
    modelId: state.LANGUAGE_MODEL.value.id,
  };
}

export async function classifyConversation(
  env: Env,
  content: string,
  customerName: string,
): Promise<{ category: string; priority: string } | null> {
  const config = getMeshChatConfig(env);
  if (!config) return null;

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `You are a support ticket classifier. Given a customer message, respond with ONLY a JSON object with two fields:
- "category": one of "bug", "feature_request", "billing", "general_question", "complaint", "praise", "spam", "other"
- "priority": one of "low", "normal", "high", "urgent"

Base priority on urgency indicators: payment/billing issues = high, service down = urgent, general questions = normal, feature requests = low.
Respond with JSON only, no explanation.`,
    },
    {
      role: "user",
      content: `Customer: ${customerName}\nMessage: ${content}`,
    },
  ];

  const ALLOWED_CATEGORIES = [
    "bug",
    "feature_request",
    "billing",
    "general_question",
    "complaint",
    "praise",
    "spam",
    "other",
  ];
  const ALLOWED_PRIORITIES = ["low", "normal", "high", "urgent"];

  try {
    const response = await generateResponse(config, messages);
    const cleaned = response.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (
      !parsed.category ||
      !parsed.priority ||
      !ALLOWED_CATEGORIES.includes(parsed.category) ||
      !ALLOWED_PRIORITIES.includes(parsed.priority)
    ) {
      console.error("[AI] Classification returned invalid values:", parsed);
      return null;
    }

    return parsed;
  } catch (err) {
    console.error("[AI] Classification failed:", err);
    return null;
  }
}

export async function summarizeConversation(
  env: Env,
  messages: Array<{ sender_name: string; content: string; direction: string }>,
): Promise<string | null> {
  const config = getMeshChatConfig(env);
  if (!config) return null;

  const transcript = messages
    .map(
      (m) =>
        `[${m.direction === "inbound" ? m.sender_name : "Support"}]: ${m.content}`,
    )
    .join("\n");

  const chatMessages: ChatMessage[] = [
    {
      role: "system",
      content:
        "Summarize this support conversation in 1-2 sentences. Focus on the customer's issue and current status. Be concise.",
    },
    {
      role: "user",
      content: transcript,
    },
  ];

  try {
    return await generateResponse(config, chatMessages);
  } catch (err) {
    console.error("[AI] Summarization failed:", err);
    return null;
  }
}

export async function suggestReply(
  env: Env,
  messages: Array<{ sender_name: string; content: string; direction: string }>,
  category: string | null,
): Promise<string | null> {
  const config = getMeshChatConfig(env);
  if (!config) return null;

  const transcript = messages
    .map(
      (m) =>
        `[${m.direction === "inbound" ? m.sender_name : "Support"}]: ${m.content}`,
    )
    .join("\n");

  const chatMessages: ChatMessage[] = [
    {
      role: "system",
      content: `You are a helpful support agent. Draft a professional and friendly reply to the customer's latest message.${category ? ` This is a ${category.replace("_", " ")} ticket.` : ""} Be concise and helpful. Write the reply only, no preamble.`,
    },
    {
      role: "user",
      content: transcript,
    },
  ];

  try {
    return await generateResponse(config, chatMessages);
  } catch (err) {
    console.error("[AI] Reply suggestion failed:", err);
    return null;
  }
}
