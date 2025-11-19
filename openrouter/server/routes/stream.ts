import { streamText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { Env } from "../main.ts";
import {
  AUTO_ROUTER_MODEL,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
  OPENROUTER_BASE_URL,
} from "../constants.ts";
import { calculateChatCost, validateChatParams } from "../tools/chat/utils.ts";
import type { ContentPart } from "../lib/types.ts";
import { OpenRouterClient } from "../lib/openrouter-client.ts";
import {
  settleChatContract,
  toMicroDollarUnits,
} from "../lib/chat-contract.ts";
import { getOpenRouterApiKey } from "../lib/env.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json",
};

type IncomingMessage = {
  role: string;
  content: string | ContentPart[];
  name?: string;
};

type StreamRequestBody = {
  messages?: IncomingMessage[];
  model?: string;
  models?: string[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string | string[];
  responseFormat?: { type: "json_object" };
  provider?: Record<string, unknown>;
  user?: string;
  tools?: unknown;
  toolChoice?: unknown;
  transforms?: string[];
  route?: "fallback";
  logitBias?: Record<number, number>;
  logprobs?: boolean | number;
  parallelToolCalls?: boolean;
  minP?: number;
  topA?: number;
  seed?: number;
};

type StreamTextParams = Parameters<typeof streamText>[0];
type StreamMessages = NonNullable<StreamTextParams["messages"]>;
type StreamTools = StreamTextParams["tools"];
type StreamToolChoice = StreamTextParams["toolChoice"];
type StreamResult = Awaited<ReturnType<typeof streamText>>;

/**
 * Handle streaming chat completion via AI SDK
 */
export async function handleStreamRoute(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: JSON_HEADERS,
    });
  }

  let payload: StreamRequestBody;
  try {
    payload = (await request.json()) as StreamRequestBody;
  } catch (error) {
    console.error("Failed to parse streaming request body:", error);
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const {
    messages,
    model = AUTO_ROUTER_MODEL,
    models,
    temperature,
    maxTokens,
    topP,
    frequencyPenalty,
    presencePenalty,
    stop,
    responseFormat,
    provider,
    user,
    tools,
    toolChoice,
    transforms,
    route,
    logitBias,
    logprobs,
    parallelToolCalls,
    minP,
    topA,
    seed,
  } = payload;

  const modelMessages = toModelMessages(messages);

  try {
    validateChatParams({
      messages: modelMessages,
      model,
      temperature,
      maxTokens,
      topP,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const apiKey = getOpenRouterApiKey(env);
  const resolvedTemperature = temperature ?? DEFAULT_TEMPERATURE;
  const resolvedMaxTokens = maxTokens ?? DEFAULT_MAX_TOKENS;

  const openrouter = createOpenRouter({
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
    compatibility: "strict",
  });

  const extraBody: Record<string, unknown> = {};
  if (models?.length) extraBody.models = models;
  if (route) extraBody.route = route;
  if (transforms?.length) extraBody.transforms = transforms;
  if (responseFormat) extraBody.response_format = responseFormat;
  if (provider) extraBody.provider = provider;
  if (user) extraBody.user = user;
  if (logitBias) extraBody.logit_bias = logitBias;
  if (logprobs !== undefined) extraBody.logprobs = logprobs;
  if (parallelToolCalls !== undefined) {
    extraBody.parallel_tool_calls = parallelToolCalls;
  }
  if (minP !== undefined) extraBody.min_p = minP;
  if (topA !== undefined) extraBody.top_a = topA;
  if (seed !== undefined) extraBody.seed = seed;

  const modelInstance =
    Object.keys(extraBody).length > 0
      ? openrouter(model, { extraBody })
      : openrouter(model);

  const stopSequences = stop
    ? Array.isArray(stop)
      ? stop.filter(Boolean)
      : [stop]
    : undefined;

  try {
    const result = await streamText({
      model: modelInstance,
      messages: modelMessages as StreamMessages,
      temperature: resolvedTemperature,
      maxOutputTokens: resolvedMaxTokens,
      topP,
      frequencyPenalty,
      presencePenalty,
      stopSequences,
      tools: tools as StreamTools,
      toolChoice: toolChoice as StreamToolChoice,
    });

    void settleStreamingContract({
      env,
      result,
      requestedModel: model,
    });

    return result.toTextStreamResponse({ headers: CORS_HEADERS });
  } catch (error) {
    console.error("Streaming error", error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Failed to start stream",
      }),
      { status: 500, headers: JSON_HEADERS },
    );
  }
}

function toModelMessages(messages?: IncomingMessage[]): StreamMessages {
  if (!messages || messages.length === 0) {
    return [] as StreamMessages;
  }

  const converted = messages.map((message) => {
    const role = normalizeRole(message.role);

    if (role === "system") {
      return {
        role: "system" as const,
        content: toSystemContent(message.content),
      };
    }

    const contentParts = toModelContentParts(message.content);

    if (role === "assistant") {
      return {
        role: "assistant" as const,
        content:
          contentParts.length > 0 ? contentParts : [{ type: "text", text: "" }],
      };
    }

    return {
      role: "user" as const,
      content:
        contentParts.length > 0 ? contentParts : [{ type: "text", text: "" }],
    };
  });

  return converted as StreamMessages;
}

type ModelTextPart = {
  type: "text";
  text: string;
};

type ModelImagePart = {
  type: "image";
  image: string;
};

type ModelContentPart = ModelTextPart | ModelImagePart;

function toModelContentParts(
  content: IncomingMessage["content"],
): ModelContentPart[] {
  if (!content) {
    return [];
  }

  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }

  const parts: ModelContentPart[] = [];

  for (const part of content) {
    if (part.type === "text") {
      parts.push({
        type: "text",
        text: part.text ?? "",
      });
    } else if (part.type === "image_url" && part.image_url?.url) {
      parts.push({
        type: "image",
        image: part.image_url.url,
      });
    }
  }

  return parts;
}

function toSystemContent(content: IncomingMessage["content"]): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join("\n");
  }

  return "";
}

function normalizeRole(role: string): "assistant" | "user" | "system" {
  if (role === "assistant" || role === "user" || role === "system") {
    return role;
  }
  if (role === "tool") {
    return "assistant";
  }
  return "user";
}

type TokenUsage = {
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
};

async function settleStreamingContract({
  env,
  result,
  requestedModel,
}: {
  env: Env;
  result: StreamResult;
  requestedModel: string;
}) {
  if (!env.OPENROUTER_CHAT_CONTRACT) {
    return;
  }

  try {
    const [usage, responseMeta] = await Promise.all([
      result.totalUsage.catch((error) => {
        console.warn("Failed to read streaming usage", error);
        return undefined;
      }),
      result.response.catch((error) => {
        console.warn("Failed to read streaming response metadata", error);
        return undefined;
      }),
    ]);

    if (!usage) {
      return;
    }

    const promptTokens = extractPromptTokens(usage);
    const completionTokens = extractCompletionTokens(usage);

    if (!promptTokens && !completionTokens) {
      return;
    }

    const resolvedModelId =
      responseMeta?.modelId && responseMeta.modelId !== AUTO_ROUTER_MODEL
        ? responseMeta.modelId
        : requestedModel;

    if (!resolvedModelId || resolvedModelId === AUTO_ROUTER_MODEL) {
      console.warn("Streaming contract settlement skipped: unknown model id");
      return;
    }

    const client = new OpenRouterClient({
      apiKey: getOpenRouterApiKey(env),
    });

    const modelInfo = await client.getModel(resolvedModelId);
    const estimatedCost = calculateChatCost(
      promptTokens,
      completionTokens,
      modelInfo.pricing,
    );

    const microUnits = toMicroDollarUnits(estimatedCost.total);
    if (!microUnits) {
      return;
    }

    await settleChatContract(env, microUnits);
  } catch (error) {
    console.error("Failed to settle OpenRouter streaming contract", error);
  }
}

function extractPromptTokens(usage: TokenUsage): number {
  const derived =
    usage.totalTokens != null && usage.outputTokens != null
      ? usage.totalTokens - usage.outputTokens
      : undefined;

  return usage.promptTokens ?? usage.inputTokens ?? derived ?? 0;
}

function extractCompletionTokens(usage: TokenUsage): number {
  const derived =
    usage.totalTokens != null && usage.promptTokens != null
      ? usage.totalTokens - usage.promptTokens
      : undefined;

  return usage.completionTokens ?? usage.outputTokens ?? derived ?? 0;
}
