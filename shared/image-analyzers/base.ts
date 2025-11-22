import { createPrivateTool } from "@decocms/runtime/mastra";
import {
  applyMiddlewares,
  withLogging,
  withRetry,
  withTimeout,
} from "./middleware.ts";
import {
  AnalyzeImageInputSchema,
  AnalyzeImageOutputSchema,
  CompareImagesInputSchema,
  CompareImagesOutputSchema,
  ExtractTextInputSchema,
  ExtractTextOutputSchema,
  type ImageAnalyzerEnv,
  type AnalyzeImageInput,
  type CompareImagesInput,
  type ExtractTextInput,
  type CreateImageAnalyzerOptions,
} from "./schemas.ts";

const MAX_ANALYSIS_RETRIES = 3;
const MAX_ANALYSIS_TIMEOUT_MS = 60_000; // 1 minute for image analysis

/**
 * Factory function to create image analyzer tools
 * Similar to createVideoGeneratorTools but for image analysis
 */
export function createImageAnalyzerTools<
  TEnv extends ImageAnalyzerEnv,
  TClient = unknown,
>(options: CreateImageAnalyzerOptions<TEnv, TClient>) {
  /**
   * ANALYZE_IMAGE tool
   */
  const analyzeImage = (env: TEnv) =>
    createPrivateTool({
      id: "ANALYZE_IMAGE",
      description:
        options.metadata.description ||
        `Analisa imagens usando ${options.metadata.provider}. Pode descrever conteúdo, identificar objetos, responder perguntas sobre a imagem.`,
      inputSchema: AnalyzeImageInputSchema,
      outputSchema: AnalyzeImageOutputSchema,
      execute: async ({ context }: { context: AnalyzeImageInput }) => {
        const doExecute = async () => {
          const contractConfig = options.analyzeTool.getContract?.(env);

          let transactionId: string | undefined;

          // Authorize contract if provided
          if (contractConfig) {
            const authResponse =
              await contractConfig.binding.CONTRACT_AUTHORIZE({
                clauses: [
                  {
                    clauseId: contractConfig.clause.clauseId,
                    amount: contractConfig.clause.amount,
                  },
                ],
              });
            transactionId = authResponse.transactionId;
          }

          const client = options.getClient(env);
          const result = await options.analyzeTool.execute({
            env,
            input: context,
            client,
          });

          // Settle contract if we authorized one
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
              title: `${options.metadata.provider} - Analyze`,
              startMessage: "Starting image analysis...",
            }),
            withRetry(MAX_ANALYSIS_RETRIES),
            withTimeout(MAX_ANALYSIS_TIMEOUT_MS),
          ],
        });

        return withMiddlewares();
      },
    });

  /**
   * COMPARE_IMAGES tool (optional)
   */
  const compareImages = options.compareTool
    ? (env: TEnv) =>
        createPrivateTool({
          id: "COMPARE_IMAGES",
          description: `Compara múltiplas imagens usando ${options.metadata.provider}. Útil para identificar diferenças, similaridades, ou analisar mudanças.`,
          inputSchema: CompareImagesInputSchema,
          outputSchema: CompareImagesOutputSchema,
          execute: async ({ context }: { context: CompareImagesInput }) => {
            const doExecute = async () => {
              const contractConfig = options.compareTool!.getContract?.(env);

              let transactionId: string | undefined;

              // Authorize contract if provided
              if (contractConfig) {
                const authResponse =
                  await contractConfig.binding.CONTRACT_AUTHORIZE({
                    clauses: [
                      {
                        clauseId: contractConfig.clause.clauseId,
                        amount: contractConfig.clause.amount,
                      },
                    ],
                  });
                transactionId = authResponse.transactionId;
              }

              const client = options.getClient(env);
              const result = await options.compareTool!.execute({
                env,
                input: context,
                client,
              });

              // Settle contract if we authorized one
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
                  title: `${options.metadata.provider} - Compare`,
                  startMessage: "Starting image comparison...",
                }),
                withRetry(MAX_ANALYSIS_RETRIES),
                withTimeout(MAX_ANALYSIS_TIMEOUT_MS),
              ],
            });

            return withMiddlewares();
          },
        })
    : null;

  /**
   * EXTRACT_TEXT_FROM_IMAGE tool (optional)
   */
  const extractTextFromImage = options.extractTextTool
    ? (env: TEnv) =>
        createPrivateTool({
          id: "EXTRACT_TEXT_FROM_IMAGE",
          description: `Extrai todo o texto visível de uma imagem usando OCR do ${options.metadata.provider}. Útil para ler documentos, placas, screenshots, etc.`,
          inputSchema: ExtractTextInputSchema,
          outputSchema: ExtractTextOutputSchema,
          execute: async ({ context }: { context: ExtractTextInput }) => {
            const doExecute = async () => {
              const contractConfig =
                options.extractTextTool!.getContract?.(env);

              let transactionId: string | undefined;

              // Authorize contract if provided
              if (contractConfig) {
                const authResponse =
                  await contractConfig.binding.CONTRACT_AUTHORIZE({
                    clauses: [
                      {
                        clauseId: contractConfig.clause.clauseId,
                        amount: contractConfig.clause.amount,
                      },
                    ],
                  });
                transactionId = authResponse.transactionId;
              }

              const client = options.getClient(env);
              const result = await options.extractTextTool!.execute({
                env,
                input: context,
                client,
              });

              // Settle contract if we authorized one
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
                  title: `${options.metadata.provider} - OCR`,
                  startMessage: "Starting text extraction...",
                }),
                withRetry(MAX_ANALYSIS_RETRIES),
                withTimeout(MAX_ANALYSIS_TIMEOUT_MS),
              ],
            });

            return withMiddlewares();
          },
        })
    : null;

  // Build tools object with available tools
  return {
    analyzeImage,
    ...(compareImages && { compareImages }),
    ...(extractTextFromImage && { extractTextFromImage }),
  };
}
