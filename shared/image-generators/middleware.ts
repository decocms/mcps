import { z } from "zod";
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

        if (error instanceof z.ZodError) {
          throw error;
        }

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

export interface ContractClause {
  clauseId: string;
  amount: number;
}

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

export interface ContractEnv {
  DECO_CHAT_WORKSPACE: string;
}
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
  const {
    clauseId,
    contract: contractKey,
    provider = "Provider",
    maxRetries = 3,
  } = options;

  const withContract = async (input: TInput, env: TEnv) => {
    const contract = env[contractKey] as Contract | undefined;

    if (!contract) {
      console.log("[Contract] Contract management not configured, skipping...");
      return fn(input, env);
    }

    const { transactionId } = await contract.CONTRACT_AUTHORIZE({
      clauses: [{ clauseId, amount: 1 }],
    });

    const result = await fn(input, env);

    await contract.CONTRACT_SETTLE({
      transactionId,
      clauses: [{ clauseId, amount: 1 }],
      vendorId: env.DECO_CHAT_WORKSPACE,
    });

    return result;
  };

  return withRetry(withLogging(withContract, provider), maxRetries);
}
