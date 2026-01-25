import { jsonSchema, parseJsonEventStream } from "ai";
import { Env } from "./types/env";

export interface TextPart {
  type: "text";
  text: string;
}

export interface ToolCallPart {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  input: string; // JSON string
}

export interface ToolResultPart {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  output: unknown;
  result: unknown;
}

export type MessagePart = TextPart | ToolCallPart | ToolResultPart;

export interface ThreadMessage {
  role: "user" | "assistant";
  parts: MessagePart[];
  timestamp: number;
}

export interface Thread {
  threadId: string;
  messages: ThreadMessage[];
  lastActivity: number;
}

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

const DEFAULT_LANGUAGE_MODEL = "anthropic/claude-4.5-sonnet";

const systemPrompt = `
If the user says you are dumb because you dont remember something, explain that you currently cannot remember tool calls, only text.
`;

export async function generateResponseForEvent(
  env: Env,
  messages: ThreadMessage[],
  subject: string,
) {
  const organizationId = env.MESH_REQUEST_CONTEXT.organizationId;
  if (!organizationId) {
    throw new Error("No organizationId found");
  }

  const modelProviderId = env.MESH_REQUEST_CONTEXT.state.MODEL_PROVIDER?.value;
  const languageModelId =
    env.MESH_REQUEST_CONTEXT.state.LANGUAGE_MODEL?.value?.id;
  const agentId = env.MESH_REQUEST_CONTEXT.state.AGENT?.value;

  if (!modelProviderId) {
    throw new Error("MODEL_PROVIDER not configured");
  }

  if (!agentId) {
    throw new Error("AGENT not configured");
  }

  const response = await fetch(
    (env.MESH_REQUEST_CONTEXT.meshUrl ?? env.MESH_URL) +
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
          connectionId: env.MESH_REQUEST_CONTEXT.state.MODEL_PROVIDER?.value,
          id: languageModelId ?? DEFAULT_LANGUAGE_MODEL,
        },
        gateway: {
          id: env.MESH_REQUEST_CONTEXT.state.AGENT?.value,
        },
        messages: [
          {
            role: "system",
            parts: [{ type: "text", text: systemPrompt }],
          },
          ...messages,
        ],
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Mesh API error (${response.status}): ${
        errorText || response.statusText
      }`,
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
    } else if (type === "text-end") {
      if (textContent) {
        collectedParts.unshift({ type: "text", text: textContent });
      }
      publishEvent({
        data: {
          text: textContent,
        },
        organizationId,
        type: "operator.text.completed",
        meshUrl: env.MESH_REQUEST_CONTEXT.meshUrl ?? env.MESH_URL,
        subject,
      });
      textContent = "";
    } else if (type === "finish") {
      publishEvent({
        data: {
          messageParts: collectedParts,
        },
        organizationId,
        type: "operator.generation.completed",
        meshUrl: env.MESH_REQUEST_CONTEXT.meshUrl ?? env.MESH_URL,
        subject,
      });
      break;
    }
  }
}

export async function publishEvent({
  data,
  organizationId,
  type,
  meshUrl,
  subject,
}: {
  type: string;
  data: unknown;
  organizationId: string;
  meshUrl: string;
  subject?: string;
}) {
  const url = new URL(
    `${meshUrl}/org/${organizationId}/events/${type}?subject=${subject}`,
  );
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Failed to publish event to mesh (${response.status}): ${
        errorText || response.statusText
      }`,
    );
  }
}
