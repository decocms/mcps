/**
 * Base factory for creating Search AI tools
 *
 * This module provides a standardized way to create MCP tools for
 * search AI providers like Perplexity, ChatGPT Search, Google Gemini, etc.
 */

import { createPrivateTool } from "@decocms/runtime/mastra";
import {
  AskInputSchema,
  ChatInputSchema,
  SearchAIOutputSchema,
  type AskInput,
  type ChatInput,
  type SearchAIOutput,
  type SearchAICallbackOutput,
} from "./schemas";
import {
  applyMiddlewares,
  withLogging,
  withRetry,
  withTimeout,
  type Contract,
  type ContractClause,
} from "./middleware";

export interface SearchAIEnv {
  DECO_REQUEST_CONTEXT: {
    ensureAuthenticated: () => any;
  };
  DECO_CHAT_WORKSPACE: string;
}

/**
 * Configuration for the ask tool (simple question)
 */
export interface AskToolConfig<TEnv extends SearchAIEnv, TClient = unknown> {
  execute: ({
    env,
    input,
    client,
  }: {
    env: TEnv;
    input: AskInput;
    client: TClient;
  }) => Promise<SearchAICallbackOutput>;
  inputSchema?: typeof AskInputSchema;
  getContract?: (env: TEnv) => {
    binding: Contract;
    clause: ContractClause;
  };
}

/**
 * Configuration for the chat tool (multi-turn conversation)
 */
export interface ChatToolConfig<TEnv extends SearchAIEnv, TClient = unknown> {
  execute: ({
    env,
    input,
    client,
  }: {
    env: TEnv;
    input: ChatInput;
    client: TClient;
  }) => Promise<SearchAICallbackOutput>;
  inputSchema?: typeof ChatInputSchema;
  getContract?: (env: TEnv) => {
    binding: Contract;
    clause: ContractClause;
  };
}

/**
 * Main configuration for creating search AI tools
 */
export interface CreateSearchAIOptions<
  TEnv extends SearchAIEnv,
  TClient = unknown,
> {
  metadata: {
    provider: string;
    description?: string;
  };
  getClient: (env: TEnv) => TClient;
  askTool: AskToolConfig<TEnv, TClient>;
  chatTool: ChatToolConfig<TEnv, TClient>;
  maxRetries?: number;
  timeoutMs?: number;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 60_000; // 1 minute

/**
 * Factory function to create search AI tools
 */
export function createSearchAITools<
  TEnv extends SearchAIEnv,
  TClient = unknown,
>(options: CreateSearchAIOptions<TEnv, TClient>) {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  /**
   * ASK tool - Simple question/answer
   */
  const ask = (env: TEnv) =>
    createPrivateTool({
      id: "ASK",
      description:
        options.metadata.description ||
        `Ask a question to ${options.metadata.provider} and get web-backed answers`,
      inputSchema: options.askTool.inputSchema || AskInputSchema,
      outputSchema: SearchAIOutputSchema,
      execute: async ({ context }: { context: AskInput }) => {
        const doExecute = async (): Promise<SearchAIOutput> => {
          // Handle contract if provided
          let transactionId: string | undefined;
          const contractConfig = options.askTool.getContract?.(env);

          if (contractConfig) {
            const { transactionId: txId } =
              await contractConfig.binding.CONTRACT_AUTHORIZE({
                clauses: [
                  {
                    clauseId: contractConfig.clause.clauseId,
                    amount: contractConfig.clause.amount,
                  },
                ],
              });
            transactionId = txId;
          }

          const client = options.getClient(env);
          const result = await options.askTool.execute({
            env,
            input: context,
            client,
          });

          if (result.error) {
            throw new Error(result.message || "Search AI request failed");
          }

          // Settle contract if provided
          if (contractConfig && transactionId) {
            await contractConfig.binding.CONTRACT_SETTLE({
              transactionId,
              clauses: [
                {
                  clauseId: contractConfig.clause.clauseId,
                  amount: contractConfig.clause.amount,
                },
              ],
              vendorId: env.DECO_CHAT_WORKSPACE,
            });
          }

          return result;
        };

        const withMiddlewares = applyMiddlewares({
          fn: doExecute,
          middlewares: [
            withLogging({
              title: `${options.metadata.provider} - Ask`,
              startMessage: "Asking question...",
            }),
            withRetry(maxRetries),
            withTimeout(timeoutMs),
          ],
        });

        return withMiddlewares();
      },
    });

  /**
   * CHAT tool - Multi-turn conversation
   */
  const chat = (env: TEnv) =>
    createPrivateTool({
      id: "CHAT",
      description:
        `Have a multi-turn conversation with ${options.metadata.provider}. ` +
        `This allows you to provide message history for more contextual responses.`,
      inputSchema: options.chatTool.inputSchema || ChatInputSchema,
      outputSchema: SearchAIOutputSchema,
      execute: async ({ context }: { context: ChatInput }) => {
        const doExecute = async (): Promise<SearchAIOutput> => {
          // Handle contract if provided
          let transactionId: string | undefined;
          const contractConfig = options.chatTool.getContract?.(env);

          if (contractConfig) {
            const { transactionId: txId } =
              await contractConfig.binding.CONTRACT_AUTHORIZE({
                clauses: [
                  {
                    clauseId: contractConfig.clause.clauseId,
                    amount: contractConfig.clause.amount,
                  },
                ],
              });
            transactionId = txId;
          }

          const client = options.getClient(env);
          const result = await options.chatTool.execute({
            env,
            input: context,
            client,
          });

          if (result.error) {
            throw new Error(result.message || "Search AI chat request failed");
          }

          // Settle contract if provided
          if (contractConfig && transactionId) {
            await contractConfig.binding.CONTRACT_SETTLE({
              transactionId,
              clauses: [
                {
                  clauseId: contractConfig.clause.clauseId,
                  amount: contractConfig.clause.amount,
                },
              ],
              vendorId: env.DECO_CHAT_WORKSPACE,
            });
          }

          return result;
        };

        const withMiddlewares = applyMiddlewares({
          fn: doExecute,
          middlewares: [
            withLogging({
              title: `${options.metadata.provider} - Chat`,
              startMessage: "Starting conversation...",
            }),
            withRetry(maxRetries),
            withTimeout(timeoutMs),
          ],
        });

        return withMiddlewares();
      },
    });

  return [ask, chat];
}
