/**
 * Central export point for all tools organized by feature modules.
 *
 * This file aggregates all tools from different modules into a single
 * export, making it easy to import all tools in main.ts while keeping
 * the modular organization.
 *
 * Modules:
 * - userTools: Standard user management tools (from shared)
 * - llmBinding: LLM binding implementation (metadata, stream, generate, list, get)
 * - modelTools: Model comparison and recommendations (separate utilities)
 */
import type { Env } from "../main.ts";
import type { UsageHooks } from "./hooks.ts";
import {
  createGetLLMTool,
  createListLLMTool,
  createLLMGenerateTool,
  createLLMMetadataTool,
  createLLMStreamTool,
} from "./llm-binding.ts";
import {
  createCompareModelsTool,
  createRecommendModelTool,
} from "./models/index.ts";

export const tools = <TEnv extends Env>(env: TEnv, hooks?: UsageHooks) => {
  return [
    // LLM Binding - implements all 5 required tools:
    // - COLLECTION_LLM_LIST
    // - COLLECTION_LLM_GET
    // - LLM_METADATA
    // - LLM_DO_STREAM
    // - LLM_DO_GENERATE
    createListLLMTool(env),
    createGetLLMTool(env),
    createLLMMetadataTool(env),
    createLLMStreamTool(hooks)(env),
    createLLMGenerateTool(hooks)(env),
    // Additional model utilities (not part of LLM binding)
    createCompareModelsTool(env),
    createRecommendModelTool(env),
  ];
};
