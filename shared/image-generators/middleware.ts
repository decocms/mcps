import { z } from "zod";

export function withRetry(maxRetries = 3) {
  return <TOutput>(fn: () => Promise<TOutput>): (() => Promise<TOutput>) => {
    return async () => {
      let lastError: Error | undefined;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await fn();
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
  };
}

export function withLogging(options: { title: string; startMessage?: string }) {
  return <TOutput>(fn: () => Promise<TOutput>): (() => Promise<TOutput>) => {
    return async () => {
      const startTime = Date.now();
      console.log(
        `[${options.title}] ${options.startMessage ?? "Starting..."}`,
      );

      try {
        const result = await fn();
        const duration = Date.now() - startTime;
        console.log(`[${options.title}] Completed in ${duration}ms`);
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`[${options.title}] Failed after ${duration}ms:`, error);
        throw error;
      }
    };
  };
}

export function withTimeout(timeoutMs: number) {
  return <TOutput>(fn: () => Promise<TOutput>): (() => Promise<TOutput>) => {
    return async () => {
      const timeoutPromise = new Promise<TOutput>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Timeout after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      );

      return Promise.race([fn(), timeoutPromise]);
    };
  };
}

export const applyMiddlewares = <TOutput>(options: {
  fn: () => Promise<TOutput>;
  middlewares: ((fn: () => Promise<TOutput>) => () => Promise<TOutput>)[];
}): (() => Promise<TOutput>) => {
  return options.middlewares.reduce(
    (acc, middleware) => middleware(acc),
    options.fn,
  );
};

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
  }) => Promise<unknown>;
}
