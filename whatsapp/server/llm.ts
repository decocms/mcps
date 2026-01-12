import { jsonSchema, parseJsonEventStream } from "ai";
import { RuntimeEnv } from "./main";
import { getWhatsappClient } from "./lib/whatsapp-client";
import {
  appendUserMessage,
  appendAssistantMessage,
  getThreadMessages,
  type MessagePart,
} from "./lib/thread";

// Schema for the AI SDK data stream events including tool calls and results
const streamEventSchema = jsonSchema<{
  type: string;
  id?: string;
  // For text-delta
  delta?: string;
  // For tool-call
  toolCallId?: string;
  toolName?: string;
  args?: string;
  // For tool-result
  result?: unknown;
  output?: unknown;
  // Common fields
  messageMetadata?: unknown;
  finishReason?: string;
}>({
  type: "object",
  properties: {
    type: { type: "string" },
    id: { type: "string" },
    delta: { type: "string" },
    toolCallId: { type: "string" },
    toolName: { type: "string" },
    args: { type: "string" },
    result: {},
    output: {},
    messageMetadata: {},
    finishReason: { type: "string" },
  },
  required: ["type"],
});

const MODEL_ID = "anthropic/claude-4.5-sonnet"; // TODO: Get from environment variable

export async function generateResponse(
  env: RuntimeEnv,
  text: string,
  from: string,
  phoneNumberId: string,
) {
  console.log("Generating response...");

  // 1. Persist user message to thread
  await appendUserMessage(from, text);

  // 2. Get full thread history for context
  const messages = await getThreadMessages(from);

  // 3. Call mesh API with full history
  const response = await fetch(
    env.MESH_BASE_URL +
      "/api/" +
      env.MESH_REQUEST_CONTEXT.organizationId +
      "/models/stream",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + env.MESH_REQUEST_CONTEXT.token,
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: {
          connectionId: env.MESH_REQUEST_CONTEXT.state.LLM.value,
          id: MODEL_ID,
        },
        gateway: {
          id: env.MESH_REQUEST_CONTEXT.state.AGENT.value,
        },
        messages,
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Mesh API error (${response.status}): ${errorText || response.statusText}`,
    );
  }

  if (!response.body) {
    throw new Error("No response body");
  }

  // 4. Process stream, collecting all parts
  const collectedParts: MessagePart[] = [];
  let textContent = "";

  // Use AI SDK's parseJsonEventStream to parse the SSE stream
  const eventStream = parseJsonEventStream({
    stream: response.body,
    schema: streamEventSchema,
  });

  const reader = eventStream.getReader();
  while (true) {
    const { done, value: event } = await reader.read();
    if (done) break;
    if (!event.success) continue;

    const { type } = event.value;

    if (type === "text-delta" && event.value.delta) {
      textContent += event.value.delta;
    } else if (
      type === "tool-call" &&
      event.value.toolCallId &&
      event.value.toolName
    ) {
      collectedParts.push({
        type: "tool-call",
        toolCallId: event.value.toolCallId,
        toolName: event.value.toolName,
        input: event.value.args ?? "{}",
      });
    } else if (
      type === "tool-result" &&
      event.value.toolCallId &&
      event.value.toolName
    ) {
      collectedParts.push({
        type: "tool-result",
        toolCallId: event.value.toolCallId,
        toolName: event.value.toolName,
        output: event.value.output,
        result: event.value.result,
      });
    } else if (type === "finish") {
      // Add text part at the beginning if any text was collected
      if (textContent) {
        collectedParts.unshift({ type: "text", text: textContent });
      }

      // Persist assistant message with all collected parts
      if (collectedParts.length > 0) {
        await appendAssistantMessage(from, collectedParts);
      }

      // Send WhatsApp response with text content
      if (textContent) {
        const client = getWhatsappClient();
        client
          .sendTextMessage({
            to: from,
            phoneNumberId,
            message: textContent,
          })
          .catch((error) => {
            console.error("[WhatsApp] Error sending text message:", error);
          });
      }

      // Exit the loop after handling finish event
      break;
    }
  }
}
