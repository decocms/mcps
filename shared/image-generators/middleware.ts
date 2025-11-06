/**
 * Middleware functions for enhancing image generator tools.
 *
 * These middleware can be composed to add retry logic, logging,
 * timeout, billing/contract management, and other cross-cutting concerns.
 */
import { z } from "zod";

/**
 * Wraps a function with automatic retry logic using exponential backoff.
 *
 * @param fn - The function to wrap
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 *
 * @example
 * ```typescript
 * const generateWithRetry = withRetry(async (input, env) => {
 *   return await callImageAPI(input);
 * }, 3);
 * ```
 */
export function withRetry<TEnv, TInput, TOutput>(
  fn: (input: TInput, env: TEnv) => Promise<TOutput>,
  maxRetries = 3,
): (input: TInput, env: TEnv) => Promise<TOutput> {
  return async (input: TInput, env: TEnv) => {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn(input, env);
      } catch (error) {
        lastError = error as Error;

        // Don't retry on validation errors
        if (error instanceof z.ZodError) {
          throw error;
        }

        // Don't retry on client errors (4xx)
        if (
          error instanceof Error &&
          (error.message.includes("400") ||
            error.message.includes("401") ||
            error.message.includes("403") ||
            error.message.includes("404"))
        ) {
          throw error;
        }

        if (attempt < maxRetries) {
          // Exponential backoff: 2^attempt seconds
          const delayMs = Math.pow(2, attempt) * 1000;
          console.log(
            `[Retry] Attempt ${attempt} failed, retrying in ${delayMs}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    throw new Error(
      `Failed after ${maxRetries} attempts: ${lastError?.message}`,
    );
  };
}

/**
 * Wraps a function with logging for monitoring and debugging.
 *
 * Logs the start, completion time, and any errors that occur.
 *
 * @param fn - The function to wrap
 * @param provider - Provider name for log messages
 *
 * @example
 * ```typescript
 * const generateWithLogging = withLogging(
 *   async (input, env) => callImageAPI(input),
 *   "Gemini"
 * );
 * ```
 */
export function withLogging<TEnv, TInput, TOutput>(
  fn: (input: TInput, env: TEnv) => Promise<TOutput>,
  provider: string,
): (input: TInput, env: TEnv) => Promise<TOutput> {
  return async (input: TInput, env: TEnv) => {
    const startTime = Date.now();
    console.log(`[${provider}] Starting image generation...`);

    try {
      const result = await fn(input, env);
      const duration = Date.now() - startTime;
      console.log(`[${provider}] Completed in ${duration}ms`);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${provider}] Failed after ${duration}ms:`, error);
      throw error;
    }
  };
}

/**
 * Wraps a function with timeout logic.
 *
 * @param fn - The function to wrap
 * @param timeoutMs - Timeout in milliseconds
 *
 * @example
 * ```typescript
 * const generateWithTimeout = withTimeout(
 *   async (input, env) => callImageAPI(input),
 *   60000 // 60 seconds
 * );
 * ```
 */
export function withTimeout<TEnv, TInput, TOutput>(
  fn: (input: TInput, env: TEnv) => Promise<TOutput>,
  timeoutMs: number,
): (input: TInput, env: TEnv) => Promise<TOutput> {
  return async (input: TInput, env: TEnv) => {
    const timeoutPromise = new Promise<TOutput>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timeout after ${timeoutMs}ms`)),
        timeoutMs,
      ),
    );

    return Promise.race([fn(input, env), timeoutPromise]);
  };
}

/**
 * Contract/Billing authorization clause.
 */
export interface ContractClause {
  clauseId: string;
  amount: number;
}

/**
 * Contract interface for billing management.
 */
export interface Contract {
  CONTRACT_AUTHORIZE: (input: {
    clauses: ContractClause[];
  }) => Promise<{ transactionId: string }>;
  CONTRACT_SETTLE: (input: {
    transactionId: string;
    clauses: ContractClause[];
    vendorId: string;
  }) => Promise<void>;
}

/**
 * Environment that supports contract management.
 */
export interface ContractEnv {
  DECO_CHAT_WORKSPACE: string;
}

/**
 * Wraps a function with contract authorization, settlement, retry logic, and logging.
 *
 * This middleware includes:
 * - Contract authorization and settlement for billing
 * - Automatic retry with exponential backoff
 * - Performance and error logging
 *
 * @param fn - The function to wrap
 * @param options - Configuration options
 * @param options.clauseId - The contract clause ID for billing
 * @param options.contract - Name of the contract property in the environment (e.g., "NANOBANANA_CONTRACT")
 * @param options.provider - Provider name for logging (default: "Provider")
 * @param options.maxRetries - Maximum number of retry attempts (default: 3)
 *
 * @example
 * ```typescript
 * const generateWithContract = withContractManagement(
 *   async (input, env) => callImageAPI(input),
 *   {
 *     clauseId: "gemini-2.5-flash-image-preview:generateContent",
 *     contract: "NANOBANANA_CONTRACT",
 *     provider: "Gemini",
 *     maxRetries: 3
 *   }
 * );
 * ```
 */
export function withContractManagement<
  TEnv extends ContractEnv & Record<string, any>,
  TInput,
  TOutput,
>(
  fn: (input: TInput, env: TEnv) => Promise<TOutput>,
  options: {
    clauseId: string;
    contract: string;
    provider?: string;
    maxRetries?: number;
  },
): (input: TInput, env: TEnv) => Promise<TOutput> {
  const { clauseId, contract: contractKey, provider = "Provider", maxRetries = 3 } = options;

  // Core contract management logic
  const withContract = async (input: TInput, env: TEnv) => {
    // Get contract from environment
    const contract = env[contractKey] as Contract | undefined;

    // Skip contract management if not configured
    if (!contract) {
      console.log("[Contract] Contract management not configured, skipping...");
      return fn(input, env);
    }

    // Authorize
    const { transactionId } = await contract.CONTRACT_AUTHORIZE({
      clauses: [{ clauseId, amount: 1 }],
    });

    // Execute
    const result = await fn(input, env);

    // Settle
    await contract.CONTRACT_SETTLE({
      transactionId,
      clauses: [{ clauseId, amount: 1 }],
      vendorId: env.DECO_CHAT_WORKSPACE,
    });

    return result;
  };

  return withRetry(withLogging(withContract, provider), maxRetries);
}
