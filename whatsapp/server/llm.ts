import { RuntimeEnv } from "./main";
import { jsonSchema, parseJsonEventStream } from "ai";
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

function getBindings(env: RuntimeEnv) {
  return {
    MODEL_PROVIDER: env.MESH_REQUEST_CONTEXT.state.MODEL_PROVIDER,
    LANGUAGE_MODEL: env.MESH_REQUEST_CONTEXT.state.LANGUAGE_MODEL,
    EVENT_BUS: env.MESH_REQUEST_CONTEXT.state.EVENT_BUS,
  };
}

export async function generateResponseForEvent(
  env: RuntimeEnv,
  messages: ThreadMessage[],
  threadId: string,
  subject: string,
) {
  const { EVENT_BUS, MODEL_PROVIDER, LANGUAGE_MODEL } = getBindings(env);
  const organizationId = env.MESH_REQUEST_CONTEXT.organizationId;
  if (!organizationId) {
    throw new Error("No organizationId found");
  }

  const modelProviderId = MODEL_PROVIDER?.value;
  const languageModelId = LANGUAGE_MODEL?.value?.id;

  if (!modelProviderId) {
    throw new Error("MODEL_PROVIDER not configured");
  }
  const body = {
    model: {
      connectionId: modelProviderId,
      id: languageModelId ?? "anthropic/claude-haiku-4.5",
    },
    agent: {
      id: null,
    },
    thread_id: threadId,
    messages,
  };

  const response = await fetch(
    (env.MESH_REQUEST_CONTEXT.meshUrl ?? env.MESH_URL) +
      "/api/" +
      env.MESH_REQUEST_CONTEXT.organizationId +
      "/decopilot/stream",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + env.MESH_REQUEST_CONTEXT.token,
        Accept: "text/event-stream",
      },
      body: JSON.stringify(body),
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
    } else if (type === "text-end") {
      if (textContent) {
        collectedParts.unshift({ type: "text", text: textContent });
      }
      await EVENT_BUS.EVENT_PUBLISH({
        type: "operator.text.completed",
        subject,
        data: {
          text: textContent,
        },
      });
      textContent = "";
    } else if (type === "finish") {
      textContent = "";
      break;
    }
  }
}
