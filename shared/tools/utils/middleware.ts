import { z } from "zod";

/**
 * Retries a function execution with exponential backoff
 * @param maxRetries Maximum number of retry attempts (default: 3)
 * @returns A middleware function that wraps the original function with retry logic
 */
export function withRetry(maxRetries = 3) {
  return <TOutput>(fn: () => Promise<TOutput>): (() => Promise<TOutput>) => {
    return async () => {
      let lastError: Error | undefined;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await fn();
        } catch (error) {
          lastError = error as Error;

          // Don't retry validation errors
          if (error instanceof z.ZodError) {
            throw error;
          }

          // Don't retry client errors (4xx)
          if (
            error instanceof Error &&
            (error.message.includes("400") ||
              error.message.includes("401") ||
              error.message.includes("403") ||
              error.message.includes("404"))
          ) {
            throw error;
          }

          // Retry with exponential backoff
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

/**
 * Adds logging to a function execution
 * @param options Configuration for logging
 * @param options.title Title to display in logs
 * @param options.startMessage Optional custom start message
 * @returns A middleware function that wraps the original function with logging
 */
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

/**
 * Adds a timeout to a function execution
 * @param timeoutMs Timeout in milliseconds
 * @returns A middleware function that wraps the original function with timeout
 */
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

/**
 * Applies multiple middlewares to a function in sequence
 * @param options Configuration for applying middlewares
 * @param options.fn The original function to wrap
 * @param options.middlewares Array of middleware functions to apply
 * @returns The wrapped function with all middlewares applied
 */
export const applyMiddlewares = <TOutput>(options: {
  fn: () => Promise<TOutput>;
  middlewares: ((fn: () => Promise<TOutput>) => () => Promise<TOutput>)[];
}): (() => Promise<TOutput>) => {
  return options.middlewares.reduce(
    (acc, middleware) => middleware(acc),
    options.fn,
  );
};

/**
 * Represents a contract clause for billing
 */
export interface ContractClause {
  clauseId: string;
  amount: number;
}

/**
 * Contract interface for authorization and settlement
 */
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
