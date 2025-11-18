/**
 * Type definitions for OpenRouter API
 */

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  pricing: {
    prompt: string; // Cost per 1M tokens
    completion: string; // Cost per 1M tokens
    request?: string;
    image?: string;
  };
  top_provider?: {
    context_length?: number;
    max_completion_tokens?: number;
    is_moderated: boolean;
  };
  per_request_limits?: {
    prompt_tokens?: string;
    completion_tokens?: string;
  };
  architecture?: {
    modality: string; // e.g., "text->text", "text+image->text"
    tokenizer: string;
    instruct_type?: string;
  };
  created?: number;
  supported_generation_methods?: string[];
}

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string | ContentPart[];
  name?: string;
  tool_call_id?: string;
}

export interface ContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
    detail?: string;
  };
}

export interface ProviderPreferences {
  sort?: "price" | "throughput" | "latency";
  only?: string[];
  exclude?: string[];
  require_parameters?: boolean;
  data_collection?: "allow" | "deny";
  allow_fallbacks?: boolean;
  quantizations?: string[];
}

export interface ChatCompletionParams {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  top_k?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  repetition_penalty?: number;
  min_p?: number;
  top_a?: number;
  seed?: number;
  logit_bias?: Record<number, number>;
  logprobs?: boolean;
  top_logprobs?: number;
  response_format?: { type: "json_object" };
  stop?: string | string[];
  stream?: boolean;
  tools?: Tool[];
  tool_choice?: ToolChoice;
  transforms?: string[];
  models?: string[]; // Fallback chain
  route?: "fallback";
  provider?: ProviderPreferences;
  user?: string;
}

export interface Tool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export type ToolChoice =
  | "none"
  | "auto"
  | {
      type: "function";
      function: { name: string };
    };

export interface ChatCompletionResponse {
  id: string;
  model: string;
  created: number;
  object: "chat.completion";
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
    native_finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  system_fingerprint?: string;
}

export interface ChatCompletionChunk {
  id: string;
  model: string;
  created: number;
  object: "chat.completion.chunk";
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
    native_finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface GenerationInfo {
  id: string;
  model: string;
  created_at: string;
  tokens_prompt: number;
  tokens_completion: number;
  native_tokens_prompt?: number;
  native_tokens_completion?: number;
  num_media_prompt?: number;
  num_media_completion?: number;
  total_cost: number;
  app_id?: number;
  streamed: boolean;
  cancelled: boolean;
  finish_reason: string;
}

export interface ModelRecommendation {
  modelId: string;
  name: string;
  reasoning: string;
  score: number;
  pricing: {
    promptPrice: string;
    completionPrice: string;
  };
  contextLength: number;
  modality: string;
}

export interface TaskRequirements {
  maxCostPer1MTokens?: number;
  minContextLength?: number;
  requiredModality?: string;
  prioritize?: "cost" | "quality" | "speed";
}

export interface StreamingSession {
  sessionId: string;
  params: ChatCompletionParams;
  createdAt: number;
  expiresAt: number;
}
