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
          console.log(`[Apify Contract] Starting ${id} tool execution`);
          
          const maxCost = await config.getMaxCost(context);
          console.log(`[Apify Contract] Estimated max cost: $${maxCost}`, {
            toolId: id,
            context: {
              actorId: context.actorId,
              memory: context.memory,
              timeout: context.timeout,
            },
          });
          
          let transactionId: string | undefined;

          // Try to get contract if available
          try {
            console.log(`[Apify Contract] Attempting to get contract for clause...`);
            const contract = config.getContract(env);
            
            console.log(`[Apify Contract] Contract info:`, {
              hasBinding: !!contract?.binding,
              hasCONTRACT_AUTHORIZE: !!contract?.binding?.CONTRACT_AUTHORIZE,
              clauseId: contract?.clause?.clauseId,
              bindingType: typeof contract?.binding,
            });
            
            if (contract?.binding?.CONTRACT_AUTHORIZE) {
              console.log(`[Apify Contract] Requesting authorization for clause: ${contract.clause.clauseId}`, {
                amount: maxCost,
                clauseId: contract.clause.clauseId,
              });
              
              const authResponse = await contract.binding.CONTRACT_AUTHORIZE({
                clauses: [
                  {
                    clauseId: contract.clause.clauseId,
                    amount: maxCost,
                  },
                ],
              });
              transactionId = authResponse.transactionId;
              console.log(`[Apify Contract] Authorization successful`, {
                transactionId,
                totalAmount: authResponse.totalAmount,
                timestamp: authResponse.timestamp,
              });
            } else {
              console.log(`[Apify Contract] No CONTRACT_AUTHORIZE binding available`);
              console.log(`[Apify Contract] CONTRACT_AUTHORIZE methods available:`, 
                Object.keys(contract?.binding || {}).filter(k => k.includes('CONTRACT')));
            }
          } catch (contractError) {
            console.warn(`[Apify Contract] Contract authorization failed, proceeding without it`, contractError);
          }

          try {
            console.log(`[Apify Contract] Executing tool: ${id}`);
            
            // Execute the actual operation
            const result = await config.execute({
              env,
              context,
              client: null, // Will be passed by caller if needed
            });

            console.log(`[Apify Contract] Tool execution completed successfully`);

            // Settle if we have a transaction ID
            if (transactionId) {
              try {
                console.log(`[Apify Contract] Settling transaction: ${transactionId}`, {
                  amount: maxCost,
                  vendorId: "apify",
                });
                
                const contract = config.getContract(env);
                if (contract?.binding?.CONTRACT_SETTLE) {
                  await contract.binding.CONTRACT_SETTLE({
                    transactionId,
                    clauses: [
                      {
                        clauseId: contract.clause.clauseId,
                        amount: maxCost,
                      },
                    ],
                    vendorId: "apify",
                  });
                  
                  console.log(`[Apify Contract] Settlement successful for transaction: ${transactionId}`);
                }
              } catch (settleError) {
                console.error(`[Apify Contract] Settlement failed for transaction: ${transactionId}`, settleError);
              }
            } else {
              console.log(`[Apify Contract] No transaction ID - contract was not authorized`);
            }

            return result;
          } catch (executionError) {
            console.error(`[Apify Contract] Tool execution failed`, executionError);
            
            // If execution fails and we have a transaction ID, try to settle for 0
            if (transactionId) {
              try {
                console.log(`[Apify Contract] Settling failed transaction for $0: ${transactionId}`);
                
                const contract = config.getContract(env);
                if (contract?.binding?.CONTRACT_SETTLE) {
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
                  
                  console.log(`[Apify Contract] Failed transaction settled for $0: ${transactionId}`);
                }
              } catch (settleError) {
                console.error(`[Apify Contract] Failed to settle error transaction: ${transactionId}`, settleError);
              }
            }

            throw executionError;
          }
        } catch (error) {
          console.error(`[Apify Contract] Fatal error in ${id}:`, error);
          throw new Error(
            error instanceof Error ? error.message : "Failed to execute Apify run",
          );
        }
      },
    });
}

