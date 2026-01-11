import { jsonSchema, parseJsonEventStream } from "ai";
import { Env } from "./main";
import { sendTextMessage } from "./tools/messages";

// Schema for the AI SDK data stream events
const streamEventSchema = jsonSchema<{
  type: string;
  id?: string;
  delta?: string;
  messageMetadata?: unknown;
  finishReason?: string;
}>({
  type: "object",
  properties: {
    type: { type: "string" },
    id: { type: "string" },
    delta: { type: "string" },
    messageMetadata: {},
    finishReason: { type: "string" },
  },
  required: ["type"],
});

const MODEL_ID = "anthropic/claude-3.5-haiku"; // TODO: Get from environment variable

export async function generateResponse(
  env: Env,
  text: string,
  from: string,
  phoneNumberId: string,
) {
  console.log("Generating response...");
  env.MESH_REQUEST_CONTEXT.state.LLM;
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
          id: env.MESH_REQUEST_CONTEXT.state.AGENT_ID,
        },
        messages: [
          {
            role: "user",
            parts: [
              {
                type: "text",
                text,
              },
            ],
          },
        ],
      }),
    },
  );

  if (!response.body) {
    throw new Error("No response body");
  }

  let fullText = "";

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
    console.log({ eventType: event.value.type });
    if (event.value.type === "text-delta" && event.value.delta) {
      fullText += event.value.delta ?? "";
    }
    if (event.value.type === "text-end") {
      sendTextMessage(env, {
        phoneNumber: from,
        phoneNumberId,
        message: fullText,
      })
        .catch((error) => {
          console.error("[WhatsApp] Error sending text message:", error);
        })
        .finally(() => {
          fullText = "";
        });
    }
  }
}
