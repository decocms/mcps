import { createPrivateTool } from "@decocms/runtime/mastra";
import { z } from "zod";

/**
 * Contract types
 */
export interface Contract {
  CONTRACT_AUTHORIZE: (input: {
    clauses: Array<{ clauseId: string; amount: number }>;
  }) => Promise<{ transactionId: string; totalAmount: string; timestamp: number }>;
  CONTRACT_SETTLE: (input: {
    transactionId: string;
    clauses?: Array<{ clauseId: string; amount: number }>;
    amount?: number;
    vendorId: string;
  }) => Promise<{ transactionId: string }>;
  CONTRACT_GET: (input: {}) => Promise<{ appName?: string; contract: any }>;
}

export interface ContractClause {
  clauseId: string;
  amount: number;
}

/**
 * Configuration for Apify run tool
 */
export interface ApifyRunToolConfig<TEnv extends { APIFY_CONTRACT?: Contract }> {
  execute: (input: {
    env: TEnv;
    context: any;
    client: any;
  }) => Promise<any>;
  getMaxCost: (context: any) => number | Promise<number>;
  getContract: (env: TEnv) => {
    binding: Contract;
    clause: ContractClause;
  };
}

/**
 * Create Apify run tool with contract support
 * Handles pre-authorization and settlement
 */
export function createApifyRunToolWithContract<
  TEnv extends { APIFY_CONTRACT?: Contract },
>(
  id: string,
  description: string,
  inputSchema: z.ZodType,
  config: ApifyRunToolConfig<TEnv>,
) {
  return (env: TEnv) =>
    createPrivateTool({
      id,
      description,
      inputSchema,
      execute: async ({ context }: { context: any }) => {
        try {
          // Get max cost for this run
          const maxCost = await config.getMaxCost(context);

          // Pre-authorize the maximum cost
          const contract = config.getContract(env);
          const authResponse = await contract.binding.CONTRACT_AUTHORIZE({
            clauses: [
              {
                clauseId: contract.clause.clauseId,
                amount: maxCost,
              },
            ],
          });

          const { transactionId } = authResponse;

          try {
            // Execute the actual operation
            const result = await config.execute({
              env,
              context,
              client: null, // Will be passed by caller if needed
            });

            // Settle with actual cost (or max if unknown)
            await contract.binding.CONTRACT_SETTLE({
              transactionId,
              clauses: [
                {
                  clauseId: contract.clause.clauseId,
                  amount: maxCost, // Use max cost (actual would require post-execution info)
                },
              ],
              vendorId: "apify",
            });

            return result;
          } catch (executionError) {
            // If execution fails, still try to settle (potentially for 0 or partial amount)
            try {
              await contract.binding.CONTRACT_SETTLE({
                transactionId,
                clauses: [
                  {
                    clauseId: contract.clause.clauseId,
                    amount: 0, // No charge on failure
                  },
                ],
                vendorId: "apify",
              });
            } catch (settleError) {
              console.error("Failed to settle contract:", settleError);
            }

            throw executionError;
          }
        } catch (error) {
          throw new Error(
            error instanceof Error ? error.message : "Failed to execute Apify run",
          );
        }
      },
    });
}

