import { createStreamableTool } from "@decocms/runtime/mastra";
import { z } from "zod";
import {
  OPENROUTER_BASE_URL,
  OPENROUTER_CHAT_ENDPOINT,
} from "../../constants.ts";
import { getOpenRouterApiKey } from "../../lib/env.ts";
import type { Env } from "../../main.ts";
import { OpenRouterClient } from "../../lib/openrouter-client.ts";
import { ChatCompletionParams } from "../../../server/lib/types.ts";

export const streamText = (env: Env) =>
  createStreamableTool({
    id: "STREAM_TEXT",
    description: "Stream text",
    inputSchema: z
      .object({
        model: z.string().optional(),
      })
      .passthrough(),
    execute: async ({ context, runtimeContext }) => {
      try {
        env.DECO_REQUEST_CONTEXT.ensureAuthenticated();

        const apiKey = getOpenRouterApiKey(env);
        const openRouterUrl = `${OPENROUTER_BASE_URL}${OPENROUTER_CHAT_ENDPOINT}`;

        const client = new OpenRouterClient({
          apiKey,
        });

        const params = context as unknown as ChatCompletionParams;

        const model = await client.getModel(params.model ?? "default");

        // Forward request to OpenRouter with adjusted headers
        const headers = new Headers();

        // Override/add specific headers
        headers.set("Authorization", `Bearer ${apiKey}`);
        // headers.set("HTTP-Referer", request.headers.get("Referer") || "");
        headers.set("X-Title", "Deco OpenRouter MCP");

        const maxContextLength = Math.min(
          JSON.stringify({ ...params.messages, ...params.tools }).length,
          model.context_length,
        );
        const maxCompletionTokens =
          params.max_tokens ??
          model.top_provider?.max_completion_tokens ??
          1000000;
        const constPerCompletionToken = parseFloat(model.pricing.completion);
        const constPerPromptToken = parseFloat(model.pricing.prompt);
        const amountUsd =
          maxContextLength * constPerPromptToken +
          maxCompletionTokens * constPerCompletionToken;
        const amountMicroDollars = amountUsd * 1000000;

        const { transactionId } =
          await env.OPENROUTER_CONTRACT.CONTRACT_AUTHORIZE({
            clauses: [
              {
                clauseId: "micro-dollar",
                amount: amountMicroDollars,
              },
            ],
          });

        const response = await fetch(openRouterUrl, {
          method: "POST",
          body: JSON.stringify(params),
          headers,
        });

        if (!response.body) {
          throw new Error("No response body received");
        }

        let usage = {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cachedTokens: 0,
          reasoningTokens: 0,
          cost: 0,
        };
        let fullResponse = "";
        let metadata = {
          model: "",
          provider: "",
        };

        const decoder = new TextDecoder();
        let buffer = "";

        let streamCompleteResolve: () => void;
        const streamComplete = new Promise<void>((resolve) => {
          streamCompleteResolve = resolve;
        });

        const processStream = new TransformStream({
          transform(chunk, controller) {
            controller.enqueue(chunk);

            buffer += decoder.decode(chunk, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.trim() || line.startsWith(":")) continue;

              if (line.startsWith("data: ")) {
                const data = line.slice(6);

                if (data === "[DONE]") {
                  return;
                }

                try {
                  const value = JSON.parse(data);
                  if (value.model) metadata.model = value.model;
                  if (value.provider) metadata.provider = value.provider;

                  if (value.usage != null) {
                    usage.promptTokens = value.usage.prompt_tokens || 0;
                    usage.completionTokens = value.usage.completion_tokens || 0;
                    usage.totalTokens = value.usage.total_tokens || 0;
                    usage.cost = value.usage.cost || 0;

                    if (value.usage.prompt_tokens_details?.cached_tokens) {
                      usage.cachedTokens =
                        value.usage.prompt_tokens_details.cached_tokens;
                    }
                    if (
                      value.usage.completion_tokens_details?.reasoning_tokens
                    ) {
                      usage.reasoningTokens =
                        value.usage.completion_tokens_details.reasoning_tokens;
                    }
                  }

                  const choice = value.choices?.[0];
                  if (choice) {
                    const content = choice.delta?.content || choice.text;
                    if (content) {
                      fullResponse += content;
                    }
                  }
                } catch (e) {
                  console.error("Failed to parse SSE data:", e);
                }
              }
            }
          },

          flush() {
            queueMicrotask(() => {
              streamCompleteResolve();
            });
          },
        });

        const ctx = runtimeContext.get("ctx") as {
          waitUntil?: (p: Promise<any>) => void;
        };
        const split = env.DECO_WORKSPACE.split("/");
        const workspace = split[split.length - 1];
        if (ctx?.waitUntil) {
          ctx.waitUntil(
            streamComplete.then(async () => {
              const costMicroDollars = usage.cost * 1000000;
              await env.OPENROUTER_CONTRACT.CONTRACT_SETTLE({
                transactionId,
                vendorId: workspace,
                clauses: [
                  {
                    clauseId: "micro-dollar",
                    amount: costMicroDollars,
                  },
                ],
              });
            }),
          );
        }

        return new Response(response.body.pipeThrough(processStream), {
          headers: response.headers,
          status: response.status,
          statusText: response.statusText,
        });
      } catch (error) {
        console.error("Failed to stream text: " + JSON.stringify(error));
        throw error;
      }
    },
  });
