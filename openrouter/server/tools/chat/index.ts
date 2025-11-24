/**
 * Chat Module
 * Tools for chat completions and metadata
 *
 * Note: Stream endpoint information is now included in each model entity
 * via the DECO_COLLECTION_MODELS_GET tool from @decocms/bindings/models
 */

export { createChatCompletionTool } from "./completion.ts";
