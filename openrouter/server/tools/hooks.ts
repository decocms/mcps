import type { LanguageModelV2Usage } from "@ai-sdk/provider";
import type { LanguageModelInputSchema } from "@decocms/bindings/llm";
import type { ModelInfo } from "../lib/types.ts";
import type { z } from "zod";

export interface UsageHooks {
  start: (
    modelInfo: ModelInfo,
    params: z.infer<typeof LanguageModelInputSchema>,
  ) => Promise<{
    end: (usage: {
      usage: LanguageModelV2Usage;
      providerMetadata?: unknown;
    }) => Promise<void>;
  }>;
}
