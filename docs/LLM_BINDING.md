# LLM Binding

The **LLM Binding** is a standardized interface that enables MCP servers to expose language models as first-class resources. It is defined by `@decocms/bindings/llm` and consists of five required tools that every LLM provider must implement.

This repository contains three implementations:

| MCP | Provider | Package | Auth |
|---|---|---|---|
| `openrouter/` | [OpenRouter](https://openrouter.ai) | `@decocms/openrouter` | OAuth PKCE via OpenRouter, or `OPENROUTER_API_KEY` env var |
| `google-gemini/` | [Google Gemini](https://ai.google.dev) | `google-gemini` | User-supplied API key via `Authorization` header |
| `deco-llm/` | Deco AI Gateway | `deco-llm` | Reuses OpenRouter tools + Deco Wallet billing |

---

## Binding Tools

Every LLM binding exposes exactly five tools. Their IDs and schemas are pulled from the shared `LANGUAGE_MODEL_BINDING` array at startup.

### `COLLECTION_LLM_LIST`

Lists available models with filtering, sorting, and pagination.

- **Input**: `{ where?, orderBy?, limit?, offset? }`
- **Output**: `{ items: ModelEntity[], totalCount: number, hasMore: boolean }`

The `where` clause supports nested `and`/`or` operators and field-level filters (`eq`, `like`, `contains`, `in`) on `id`, `title`, and `provider`. Default sorting prioritizes a curated list of well-known model IDs; custom `orderBy` on `id` or `title` (asc/desc) is also supported.

### `COLLECTION_LLM_GET`

Retrieves a single model by its ID.

- **Input**: `{ id: string }`
- **Output**: `{ item: ModelEntity | null }`

Returns `null` (not an error) when the model is not found.

### `LLM_METADATA`

Returns runtime metadata about a model's capabilities, primarily the URL patterns it can accept for different media types.

- **Input**: `{ modelId: string }`
- **Output**: `{ supportedUrls: Record<string, string[]> }`

Example response for a vision-capable model:

```json
{
  "supportedUrls": {
    "text/*": ["data:*"],
    "image/*": ["https://*", "data:*"]
  }
}
```

### `LLM_DO_STREAM`

Streams a language model response in real-time. This is a **streamable tool** (returns a `Response` with a streaming body).

- **Input**: `{ modelId: string, callOptions: { prompt, tools?, maxOutputTokens?, ... } }`
- **Output**: Streaming `Response` using `streamToResponse()` from `@decocms/runtime/bindings`

Requires authentication (`env.MESH_REQUEST_CONTEXT.ensureAuthenticated()`). Includes a 20-second slow-request warning and request-level logging with unique IDs.

### `LLM_DO_GENERATE`

Generates a complete (non-streaming) response in a single call.

- **Input**: `{ modelId: string, callOptions: { prompt, tools?, maxOutputTokens?, ... } }`
- **Output**: `{ content: ContentPart[], finishReason: string, usage: object, warnings: array, ... }`

Content parts are normalized from the AI SDK format into the binding schema format, supporting `text`, `file`, `reasoning`, `tool-call`, and `tool-result` types.

#### Token Usage and Cost Reporting

Both `LLM_DO_STREAM` and `LLM_DO_GENERATE` return token usage information via the `usage` field from the AI SDK's `LanguageModelV2Usage` interface:

```typescript
{
  usage: {
    promptTokens: number;      // Number of tokens in the input
    completionTokens: number;  // Number of tokens in the output
  }
}
```

Providers may include additional cost information in `providerMetadata`. For example, OpenRouter includes the actual cost:

```typescript
{
  providerMetadata: {
    openrouter: {
      usage: {
        cost: number;  // Actual cost in USD (e.g., 0.00015)
      }
    }
  }
}
```

**Important**: The `costs` field in model entities (`COLLECTION_LLM_LIST` and `COLLECTION_LLM_GET`) stores pricing as **per-token costs in USD**:

```typescript
{
  costs: {
    input: number;   // Cost per input token (USD), e.g., 0.000003 = $0.000003/token
    output: number;  // Cost per output token (USD)
  }
}
```

Different providers return pricing in different formats from their APIs:
- **OpenRouter**: Returns per-token prices directly (e.g., "0.000003" = $0.000003/token)
- **Google Gemini**: Returns prices per 1M tokens (e.g., "0.15" = $0.15/1M tokens), which the binding divides by 1,000,000 to normalize to per-token

---

## Model Entity Schema

Both `COLLECTION_LLM_LIST` and `COLLECTION_LLM_GET` return models in a normalized shape (`ModelCollectionEntitySchema`):

```typescript
{
  id: string;              // e.g. "gemini-2.0-flash" or "anthropic/claude-3.5-sonnet"
  title: string;           // Human-readable name
  logo: string;            // Provider logo URL
  description: string | null;
  capabilities: string[];  // e.g. ["text", "vision", "tools", "json-mode"]
  provider: string;        // "google" | "openrouter"
  limits: {
    contextWindow: number;
    maxOutputTokens: number;
  } | null;
  costs: {
    input: number;         // Cost per token (USD)
    output: number;        // Cost per token (USD)
  } | null;
  created_at: string;
  updated_at: string;
}
```

---

## Implementation Details per Provider

### OpenRouter (`openrouter/`)

- **AI SDK provider**: `@openrouter/ai-sdk-provider` (`createOpenRouter`)
- **API client**: Custom `OpenRouterClient` for model listing/fetching
- **Auth**: OAuth PKCE flow against `https://openrouter.ai/auth`, or a raw API key from `OPENROUTER_API_KEY` env var / `Authorization` header
- **Provider field**: All models report `provider: "openrouter"`
- **Logos**: Extensive per-provider logo mapping (Anthropic, OpenAI, Google, Meta, Mistral, etc.)
- **Capabilities**: Detected from `architecture.modality` (vision), `supported_generation_methods` (tools, json_mode)
- **Pricing**: Uses raw per-token values from the OpenRouter API
- **Exports**: Reusable as a package (`@decocms/openrouter`) with `./tools`, `./types`, and `./hooks` exports

### Google Gemini (`google-gemini/`)

- **AI SDK provider**: `@ai-sdk/google` (`createGoogleGenerativeAI`)
- **API client**: Custom `GeminiClient` for model listing/fetching
- **Auth**: User-provided Google AI API key via `Authorization: Bearer <key>` header (acts as a proxy)
- **Provider field**: All models report `provider: "google"`
- **Logo**: Single Google Gemini logo for all models
- **Capabilities**: Detected from `architecture.modality` (vision), `supported_generation_methods` (tools via `generateContent`)
- **Pricing**: API returns prices per 1M tokens; the binding divides by 1,000,000 to normalize to per-token

### Deco LLM Gateway (`deco-llm/`)

- **Reuses OpenRouter**: Imports `tools` from `@decocms/openrouter/tools` directly -- does **not** reimplement the binding
- **Wallet integration**: Wraps the OpenRouter tools with a `UsageHooks` implementation that:
  1. **Pre-authorizes** a spending amount via `WALLET::PRE_AUTHORIZE_AMOUNT` before each request
  2. **Commits** the actual cost via `WALLET::COMMIT_PRE_AUTHORIZED_AMOUNT` after the response completes
- **Pre-auth calculation** (`usage.ts`): Estimates max cost as `contextLength * promptPrice + maxCompletionTokens * completionPrice`, converted to microdollars
- **Cost tracking**: Reads actual cost from `providerMetadata.openrouter.usage.cost` in the stream/generate finish event
- **State**: Requires a `WALLET` binding (`@deco/wallet`) in the runtime state schema
- **Deployed at**: `https://sites-deco-llm.decocache.com/mcp`

---

## Usage Hooks

Both `openrouter/` and `google-gemini/` support an optional `UsageHooks` interface that wraps the stream/generate tools with lifecycle callbacks:

```typescript
interface UsageHooks {
  start: (
    modelInfo: ModelInfo,
    params: LanguageModelInput,
  ) => Promise<{
    end: (usage: { usage: LanguageModelV2Usage; providerMetadata?: unknown }) => Promise<void>;
  }>;
}
```

- `start` is called **before** the model request, receiving the resolved model info and full call parameters. It returns an `end` callback.
- `end` is called **after** the response completes (or the stream finishes), receiving token usage and optional provider metadata.

The `deco-llm` gateway uses this interface to implement pay-per-use billing through the Deco Wallet.

---

## Shared Patterns

All three implementations share the following patterns:

1. **Schema extraction at startup**: Binding schemas are extracted from `LANGUAGE_MODEL_BINDING` and validated with runtime assertions
2. **AI SDK v2 compatibility**: Both `doStream` and `doGenerate` use the Vercel AI SDK's `LanguageModelV2` interface
3. **Error handling**: API errors are detected via `Symbol.for("vercel.ai.error")` and forwarded with original status codes
4. **Content normalization**: `transformContentPart` and `transformGenerateResult` normalize AI SDK responses into the binding schema
5. **Well-known model ordering**: A curated list of model IDs is used to sort popular models to the top of list results
6. **Private/streamable tools**: List, get, metadata, and generate use `createPrivateTool`; stream uses `createStreamableTool`

---

## Key Dependencies

| Package | Purpose |
|---|---|
| `@decocms/bindings/llm` | Binding definitions and schemas (`LANGUAGE_MODEL_BINDING`, `ModelCollectionEntitySchema`) |
| `@decocms/runtime/bindings` | `streamToResponse` for converting AI SDK streams to HTTP responses |
| `@decocms/runtime/tools` | `createPrivateTool`, `createStreamableTool` |
| `@ai-sdk/provider` | AI SDK types (`LanguageModelV2StreamPart`, `APICallError`, `LanguageModelV2Usage`) |
| `@ai-sdk/google` | Google Gemini AI SDK provider |
| `@openrouter/ai-sdk-provider` | OpenRouter AI SDK provider |
