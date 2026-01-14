/**
 * LLM Generate With Thread Tool
 *
 * Generates LLM responses using thread context from the database.
 * Automatically retrieves thread history, appends new user message,
 * calls LLM_DO_GENERATE, and persists the conversation turn.
 */

import {
  LANGUAGE_MODEL_BINDING,
  type LanguageModelGenerateOutputSchema,
} from "@decocms/bindings/llm";
import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { tools } from "@decocms/openrouter/tools";
import type { Env } from "../main.ts";
import {
  createRetrieveThreadDataTool,
  createSaveThreadDataTool,
} from "./threads.ts";
import { LanguageModelCallOptionsSchema } from "@decocms/bindings/llm";

// Find the GENERATE binding schema
const GENERATE_BINDING = LANGUAGE_MODEL_BINDING.find(
  (b: { name: string }) => b.name === "LLM_DO_GENERATE",
);

if (!GENERATE_BINDING?.inputSchema || !GENERATE_BINDING?.outputSchema) {
  throw new Error("LLM_DO_GENERATE binding not found or missing schemas");
}

// Input schema: same as LLM_DO_GENERATE but with optional threadId
const LLMDoGenerateWithThreadInputSchema = z
  .object({
    modelId: z.string().describe("The ID of the model"),
    callOptions: LanguageModelCallOptionsSchema, // LanguageModelCallOptionsSchema
    threadId: z.string().optional().describe("Optional thread ID to use for context"),
  })
  .passthrough();

// Output schema: same as LLM_DO_GENERATE
const LLMDoGenerateWithThreadOutputSchema = GENERATE_BINDING.outputSchema;

/**
 * Convert thread messages (from database) to LanguageModelMessageSchema format
 */
function convertThreadMessagesToPrompt(
  messages: Array<{ role: string; content: string }>,
): Array<{ role: string; content: Array<{ type: string; text: string }> }> {
  return messages.map((msg) => ({
    role: msg.role,
    content: [
      {
        type: "text",
        text: msg.content,
      },
    ],
    providerOptions: undefined,
  }));
}

/**
 * Extract text content from user message content array
 */
function extractUserContent(
  userMessage: { content: Array<Record<string, unknown>> },
): string {
  const textParts = userMessage.content
    .filter((part: Record<string, unknown>) => {
      return part.type === "text" && typeof part.text === "string";
    })
    .map((part: Record<string, unknown>) => {
      return String(part.text ?? "");
    });
  return textParts.join("\n");
}

/**
 * Extract text content from assistant generation output
 */
function extractAssistantContent(
  generation: z.infer<typeof LanguageModelGenerateOutputSchema>,
): string {
  const textParts = generation.content
    .filter((part: Record<string, unknown>) => {
      return part.type === "text" && typeof part.text === "string";
    })
    .map((part: Record<string, unknown>) => {
      return String(part.text ?? "");
    });
  return textParts.join("\n");
}

/**
 * Extract tool calls from assistant generation output
 */
function extractToolCalls(
  generation: z.infer<typeof LanguageModelGenerateOutputSchema>,
): Array<Record<string, unknown>> {
  return generation.content
    .filter((part: Record<string, unknown>) => {
      return part.type === "tool-call";
    })
    .map((part: Record<string, unknown>) => {
      return {
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: part.input,
      };
    });
}

/**
 * LLM_DO_GENERATE_WITH_THREAD - Generate LLM response with thread context
 *
 * Retrieves thread history, appends new user message, generates response,
 * and persists the conversation turn to the database.
 */
export const createLLMDoGenerateWithThreadTool = (env: Env) =>
  createPrivateTool({
    id: "LLM_DO_GENERATE_WITH_THREAD",
    description:
      "Generate a language model response using thread context from the database. " +
      "Retrieves existing thread messages, appends the new user message, generates a response, " +
      "and automatically saves the conversation turn (user + assistant) to the thread.",
    inputSchema: LLMDoGenerateWithThreadInputSchema,
    outputSchema: LLMDoGenerateWithThreadOutputSchema,
    execute: async ({
      context,
    }: {
      context: z.infer<typeof LLMDoGenerateWithThreadInputSchema>;
    }) => {
      const { modelId, callOptions, threadId: providedThreadId } = context;

      // Step 1: Determine thread ID
      const finalThreadId = providedThreadId ?? crypto.randomUUID();

      // Step 2: Retrieve thread messages (or empty array if thread doesn't exist)
      let threadMessages: Array<{ role: string; content: string }> = [];
      try {
        const retrieveTool = createRetrieveThreadDataTool(env);
        const threadData = await retrieveTool.execute({
          context: { threadId: finalThreadId },
        });
        threadMessages = threadData.messages;
      } catch (error) {
        // Thread doesn't exist - continue with empty array
        if (
          error instanceof Error &&
          error.message.includes("not found")
        ) {
          threadMessages = [];
        } else {
          throw error;
        }
      }

      // Step 3: Get last message from callOptions.prompt and validate it's a user message
      const prompt = callOptions.prompt as Array<{
        role: string;
        content: Array<Record<string, unknown>>;
      }>;
      if (!Array.isArray(prompt) || prompt.length === 0) {
        throw new Error("callOptions.prompt must be a non-empty array");
      }

      const lastUserMessage = prompt[prompt.length - 1] as {
        role: string;
        content: Array<Record<string, unknown>>;
      };
      if (lastUserMessage.role !== "user") {
        throw new Error(
          "The last message in callOptions.prompt must have role 'user'",
        );
      }

      // Step 4: Convert thread messages to prompt format and merge with new user message
      const threadPrompt = convertThreadMessagesToPrompt(threadMessages);
      const mergedPrompt = [...threadPrompt, lastUserMessage];

      // Step 5: Call LLM_DO_GENERATE with merged prompt using the existing tool
      env.MESH_REQUEST_CONTEXT.ensureAuthenticated();

      // Get LLM tools with hooks (same as in main.ts)
      const llmTools = tools(env, {
        start: async (modelInfo, params) => {
          const { calculatePreAuthAmount, toMicrodollars } = await import("../usage.ts");
          const amount = calculatePreAuthAmount(modelInfo, params);

          const { id } =
            await env.MESH_REQUEST_CONTEXT.state.WALLET.PRE_AUTHORIZE_AMOUNT({
              amount,
              metadata: {
                modelId: modelInfo.id,
                params: params,
              },
            });
          return {
            end: async (usage: unknown) => {
              interface OpenRouterUsageReport {
                providerMetadata: {
                  openrouter: {
                    usage: {
                      cost: number;
                    };
                  };
                };
              }
              const usageReport = usage as OpenRouterUsageReport;
              if (
                !usageReport?.providerMetadata?.openrouter?.usage?.cost
              ) {
                throw new Error("Usage cost not found");
              }
              const vendorId = "deco"; // Default vendor ID
              await env.MESH_REQUEST_CONTEXT.state.WALLET.COMMIT_PRE_AUTHORIZED_AMOUNT(
                {
                  identifier: id,
                  contractId:
                    env.MESH_REQUEST_CONTEXT.connectionId ??
                    env.MESH_REQUEST_CONTEXT.state.WALLET.value,
                  vendorId,
                  amount: toMicrodollars(
                    usageReport.providerMetadata.openrouter.usage.cost,
                  ),
                },
              );
            },
          };
        },
      });

      // Find LLM_DO_GENERATE tool
      const generateTool = llmTools.find((tool) => tool.id === "LLM_DO_GENERATE");
      if (!generateTool) {
        throw new Error("LLM_DO_GENERATE tool not found");
      }

      // Call LLM_DO_GENERATE with merged prompt
      const generation = (await generateTool.execute({
        context: {
          modelId,
          callOptions: {
            ...callOptions,
            prompt: mergedPrompt,
          },
        },
      })) as z.infer<typeof LanguageModelGenerateOutputSchema>;

      // Step 6: Extract content and save to thread
      const userContent = extractUserContent(
        lastUserMessage as { content: Array<Record<string, unknown>> },
      );
      const assistantContent = extractAssistantContent(generation);
      const toolCalls = extractToolCalls(generation);
      const tokensUsed = generation.usage?.totalTokens ?? 0;

      // Save the conversation turn
      const saveTool = createSaveThreadDataTool(env);
      await saveTool.execute({
        context: {
          threadId: finalThreadId,
          userContent,
          assistantContent,
          assistantMetadata: { generation },
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          tokensUsed,
          model: modelId,
          finishReason: generation.finishReason,
        },
      });

      // Step 7: Return the generation result (same as LLM_DO_GENERATE)
      return generation;
    },
  });
