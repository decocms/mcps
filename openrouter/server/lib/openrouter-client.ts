/**
 * OpenRouter API client
 * Handles all communication with the OpenRouter API
 */

import { OpenRouter as OpenRouterSDK } from "@openrouter/sdk";
import type {
	ChatGenerationParams,
	ChatMessageContentItem,
	ModelsListResponse,
	OpenResponsesUsage,
	ChatResponse as SDKChatResponse,
	Message as SDKMessage,
	Model as SDKModel,
} from "@openrouter/sdk/models";
import type { GetGenerationResponse } from "@openrouter/sdk/models/operations";
import type {
	ChatCompletionParams,
	ChatCompletionResponse,
	GenerationInfo,
	ModelInfo,
} from "./types.ts";

export interface OpenRouterClientConfig {
	apiKey: string;
}

const MODEL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedModelEntry {
	model: ModelInfo;
	fetchedAt: number;
}

const PRICE_FALLBACK = "0";

export class OpenRouterClient {
	private sdk: OpenRouterSDK;
	private modelCache: Map<string, CachedModelEntry>;

	constructor(config: OpenRouterClientConfig) {
		this.sdk = new OpenRouterSDK({
			apiKey: config.apiKey,
		});
		this.modelCache = new Map();
	}

	/**
	 * List all available models
	 */
	async listModels(): Promise<ModelInfo[]> {
		const response: ModelsListResponse = await this.sdk.models.list();

		const models = response.data ?? [];
		const converted = models.map((model) => this.toModelInfo(model));

		const fetchedAt = Date.now();
		for (const model of converted) {
			this.modelCache.set(model.id, { model, fetchedAt });
		}

		return converted;
	}

	/**
	 * Get detailed information about a specific model
	 */
	async getModel(modelId: string): Promise<ModelInfo> {
		const cached = this.modelCache.get(modelId);
		if (cached && Date.now() - cached.fetchedAt < MODEL_CACHE_TTL_MS) {
			return cached.model;
		}

		const models = await this.listModels();
		const model = models.find(({ id }) => id === modelId);

		if (!model) {
			throw new Error(`Model "${modelId}" not found in OpenRouter catalog`);
		}

		this.modelCache.set(modelId, { model, fetchedAt: Date.now() });
		return model;
	}

	/**
	 * Send a chat completion request (non-streaming)
	 */
	async chatCompletion(
		params: ChatCompletionParams,
	): Promise<ChatCompletionResponse> {
		if (params.provider) {
			throw new Error(
				"Provider preferences are not supported by the OpenRouter TypeScript SDK yet. Please remove the provider field and try again.",
			);
		}

		const sdkParams = this.toSDKChatParams(params);
		const response = await this.sdk.chat.send({ ...sdkParams, stream: false });

		return this.fromSDKChatResponse(response);
	}

	/**
	 * Get generation information by ID
	 */
	async getGeneration(generationId: string): Promise<GenerationInfo> {
		const response: GetGenerationResponse =
			await this.sdk.generations.getGeneration({ id: generationId });

		return this.toGenerationInfo(response.data);
	}

	private toModelInfo(model: SDKModel): ModelInfo {
		return {
			id: model.id,
			name: model.name,
			description: model.description ?? undefined,
			context_length: model.contextLength ?? 0,
			pricing: {
				prompt: this.toPriceString(model.pricing.prompt),
				completion: this.toPriceString(model.pricing.completion),
				request: this.toPriceString(model.pricing.request),
				image: this.toPriceString(model.pricing.image),
			},
			top_provider: model.topProvider
				? {
						context_length: model.topProvider.contextLength ?? undefined,
						max_completion_tokens:
							model.topProvider.maxCompletionTokens ?? undefined,
						is_moderated: model.topProvider.isModerated,
					}
				: undefined,
			per_request_limits: model.perRequestLimits
				? {
						prompt_tokens: model.perRequestLimits.promptTokens?.toString(),
						completion_tokens:
							model.perRequestLimits.completionTokens?.toString(),
					}
				: undefined,
			architecture: {
				modality: model.architecture.modality ?? "text->text",
				tokenizer: model.architecture.tokenizer ?? "unknown",
				instruct_type: model.architecture.instructType ?? undefined,
			},
			created: model.created,
			supported_generation_methods: model.supportedParameters?.map(
				(parameter) => parameter,
			),
		};
	}

	private toPriceString(value: unknown): string {
		if (value === null || value === undefined) {
			return PRICE_FALLBACK;
		}
		return typeof value === "string" ? value : String(value);
	}

	private toSDKChatParams(params: ChatCompletionParams): ChatGenerationParams {
		const messages = this.toSDKMessages(params.messages);

		const sdkParams: ChatGenerationParams = {
			messages,
			model: params.model,
			models: params.models,
			temperature: params.temperature ?? null,
			maxTokens: params.max_tokens ?? null,
			topP: params.top_p ?? null,
			frequencyPenalty: params.frequency_penalty ?? null,
			presencePenalty: params.presence_penalty ?? null,
			stop: params.stop ?? null,
			logitBias: params.logit_bias ?? null,
			logprobs: params.logprobs ?? null,
			topLogprobs: params.top_logprobs ?? null,
			seed: params.seed ?? null,
			responseFormat: params.response_format
				? { type: params.response_format.type }
				: undefined,
			tools: params.tools,
			toolChoice: params.tool_choice,
			user: params.user,
		};

		return sdkParams;
	}

	private toSDKMessages(
		messages: ChatCompletionParams["messages"],
	): SDKMessage[] {
		return messages.map((message) => {
			const content = this.toSDKContent(message.content);

			if (message.role === "user") {
				return {
					role: "user",
					content,
					name: message.name,
				};
			}

			if (message.role === "system") {
				return {
					role: "system",
					content: this.toSystemContent(message.content),
					name: message.name,
				};
			}

			if (message.role === "assistant") {
				return {
					role: "assistant",
					content,
					name: message.name,
				};
			}

			if (message.role === "tool") {
				if (!message.tool_call_id) {
					throw new Error(
						"Tool messages must include 'tool_call_id' when using the OpenRouter SDK.",
					);
				}
				return {
					role: "tool",
					content,
					toolCallId: message.tool_call_id,
				};
			}

			throw new Error(`Unsupported chat role: ${message.role}`);
		});
	}

	private toSDKContent(
		content: ChatCompletionParams["messages"][number]["content"],
	): string | ChatMessageContentItem[] {
		if (typeof content === "string") {
			return content;
		}

		return content.map((part): ChatMessageContentItem => {
			if (part.type === "text") {
				return {
					type: "text",
					text: part.text ?? "",
				};
			}

			return {
				type: "image_url",
				imageUrl: {
					url: part.image_url?.url ?? "",
					detail: part.image_url?.detail as never,
				},
			};
		});
	}

	private toSystemContent(
		content: ChatCompletionParams["messages"][number]["content"],
	): string {
		if (typeof content === "string") {
			return content;
		}

		return content
			.map((part) => (part.type === "text" ? (part.text ?? "") : ""))
			.join("")
			.trim();
	}

	private fromSDKChatResponse(
		response: SDKChatResponse,
	): ChatCompletionResponse {
		return {
			id: response.id,
			model: response.model,
			created: response.created,
			object: response.object,
			choices: response.choices.map((choice) => ({
				index: choice.index,
				message: {
					role: choice.message.role,
					content: this.extractMessageContent(choice.message),
					tool_calls: choice.message.toolCalls?.map((tool) => ({
						id: tool.id,
						type: tool.type,
						function: {
							name: tool.function.name,
							arguments: tool.function.arguments,
						},
					})),
				},
				finish_reason: choice.finishReason ?? null,
				native_finish_reason: null,
			})),
			usage: this.mapUsage(response.usage),
		};
	}

	private extractMessageContent(
		message: SDKChatResponse["choices"][number]["message"],
	): string | null {
		if (typeof message.content === "string") {
			return message.content;
		}

		if (Array.isArray(message.content)) {
			return message.content
				.map((part) => {
					if (part.type === "text") {
						return part.text ?? "";
					}
					return "";
				})
				.join("")
				.trim();
		}

		return null;
	}

	private mapUsage(
		usage: OpenResponsesUsage | SDKChatResponse["usage"] | undefined,
	): ChatCompletionResponse["usage"] | undefined {
		if (!usage) {
			return undefined;
		}

		if ("promptTokens" in usage) {
			return {
				prompt_tokens: usage.promptTokens ?? 0,
				completion_tokens: usage.completionTokens ?? 0,
				total_tokens: usage.totalTokens ?? 0,
			};
		}

		const openResponsesUsage = usage as OpenResponsesUsage;
		return {
			prompt_tokens: openResponsesUsage.inputTokens ?? 0,
			completion_tokens: openResponsesUsage.outputTokens ?? 0,
			total_tokens: openResponsesUsage.totalTokens ?? 0,
		};
	}

	private toGenerationInfo(
		data: GetGenerationResponse["data"],
	): GenerationInfo {
		return {
			id: data.id,
			model: data.model,
			created_at: data.createdAt,
			tokens_prompt: data.tokensPrompt ?? 0,
			tokens_completion: data.tokensCompletion ?? 0,
			native_tokens_prompt: data.nativeTokensPrompt ?? undefined,
			native_tokens_completion: data.nativeTokensCompletion ?? undefined,
			num_media_prompt: data.numMediaPrompt ?? undefined,
			num_media_completion: data.numMediaCompletion ?? undefined,
			total_cost: data.totalCost,
			app_id: data.appId ?? undefined,
			streamed: data.streamed ?? false,
			cancelled: data.cancelled ?? false,
			finish_reason: data.finishReason ?? "unknown",
		};
	}
}
