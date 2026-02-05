/**
 * Middleware for Search AI operations
 * Re-exports common middlewares from image-generators
 */
export {
  applyMiddlewares,
  withLogging,
  withRetry,
  withTimeout,
  type Contract,
  type ContractClause,
} from "../image-generators/middleware";
