# OpenRouter MCP

A comprehensive Model Context Protocol (MCP) server for [OpenRouter](https://openrouter.ai), providing unified access to hundreds of AI models with intelligent routing, cost optimization, and fallback mechanisms.

## Overview

OpenRouter is a unified API for accessing AI models from multiple providers (OpenAI, Anthropic, Google, Meta, and more). This MCP makes it easy to discover, compare, and use these models through a standardized interface with built-in features like:

- 🤖 **Access to 100+ AI Models** - GPT-4, Claude, Gemini, Llama, and many more
- 🔄 **Automatic Fallback** - Chain models for reliability and availability
- 💰 **Cost Optimization** - Compare prices and optimize provider selection
- 🎯 **Smart Routing** - Auto-select the best model for your task
- 🚀 **Streaming Support** - Real-time streaming via Server-Sent Events
- 🔍 **Model Discovery** - Search, filter, and compare models easily

## Features

### 🔧 **Tools & APIs**

#### Model Discovery (4 tools)
1. **`OPENROUTER_LIST_MODELS`** - List and filter available models
2. **`OPENROUTER_GET_MODEL`** - Get detailed model information
3. **`OPENROUTER_COMPARE_MODELS`** - Compare multiple models side-by-side
4. **`OPENROUTER_RECOMMEND_MODEL`** - Get AI model recommendations for tasks

#### AI Chat
- **`OPENROUTER_CHAT_COMPLETION`** – Non-streaming chat completions
- **`OPENROUTER_GET_STREAM_ENDPOINT`** – Returns the deployed `POST /api/chat` URL plus usage instructions
- **`POST /api/chat`** – Real-time streaming endpoint built with the [Vercel AI SDK](https://github.com/vercel/ai) that emits Server-Sent Events compatible with `useChat`, `streamText`, or any SSE client. Payload mirrors the `OPENROUTER_CHAT_COMPLETION` tool schema.

### 🌐 **API Routes**
- **`POST /api/chat`** - Streams OpenRouter responses directly from the worker (no intermediate tool call required)

## Installation

### Prerequisites

1. Get an OpenRouter API key from [openrouter.ai/keys](https://openrouter.ai/keys)
2. Node.js 22+ and Bun installed

### Setup

```bash
# Navigate to the openrouter directory
cd openrouter

# Install dependencies
bun install

# Configure your API key (create a .dev.vars file)
echo "OPENROUTER_API_KEY=your_api_key_here" > .dev.vars

# Start development server
bun run dev
```

## Configuration

When installing this MCP, you'll need to provide:

| Field | Required | Description |
|-------|----------|-------------|
| `apiKey` | ✅ Yes | Your OpenRouter API key from [openrouter.ai/keys](https://openrouter.ai/keys) |
| `siteName` | ❌ No | Your site name (helps with rankings on openrouter.ai) |
| `siteUrl` | ❌ No | Your site URL (used for attribution and streaming endpoints) |
| `defaultTemperature` | ❌ No | Default temperature for responses (0-2, default: 1) |
| `defaultMaxTokens` | ❌ No | Default max tokens for responses |

## Usage Examples

### 1. List Available Models

Filter and sort through 100+ AI models:

```typescript
// List all models, sorted by price
const { models, total } = await OPENROUTER_LIST_MODELS({
  sortBy: "price",
  limit: 10
});

// Filter for vision models under $5/1M tokens
const { models } = await OPENROUTER_LIST_MODELS({
  filter: {
    modality: "text+image->text",
    maxPromptPrice: 5.0,
    minContextLength: 100000
  },
  sortBy: "price"
});

// Search for specific models
const { models } = await OPENROUTER_LIST_MODELS({
  filter: {
    search: "gpt-4"
  }
});
```

### 2. Get Model Details

Get comprehensive information about a specific model:

```typescript
const model = await OPENROUTER_GET_MODEL({
  modelId: "anthropic/claude-3.5-sonnet"
});

console.log(model.pricing); // { prompt: "3", completion: "15" }
console.log(model.contextLength); // 200000
console.log(model.modality); // "text->text"
```

### 3. Compare Models

Compare multiple models to choose the best one:

```typescript
const { comparison, recommendation } = await OPENROUTER_COMPARE_MODELS({
  modelIds: [
    "openai/gpt-4o",
    "anthropic/claude-3.5-sonnet",
    "google/gemini-2.0-flash-exp"
  ],
  criteria: ["price", "context_length"]
});

console.log(recommendation);
// "google/gemini-2.0-flash-exp is most cost-effective. 
//  anthropic/claude-3.5-sonnet has the largest context window."
```

### 4. Get Model Recommendations

Get intelligent model suggestions based on your task:

```typescript
const { recommendations } = await OPENROUTER_RECOMMEND_MODEL({
  taskDescription: "generate Python code with detailed explanations",
  requirements: {
    maxCostPer1MTokens: 10,
    minContextLength: 50000,
    prioritize: "quality"
  }
});

recommendations.forEach(rec => {
  console.log(`${rec.name} (score: ${rec.score})`);
  console.log(`Reasoning: ${rec.reasoning}`);
  console.log(`Price: $${rec.pricing.promptPrice}/1M tokens\n`);
});
```

### 5. Chat Completion (Non-Streaming)

Send chat requests and get complete responses:

```typescript
// Simple chat with auto-routing
const response = await OPENROUTER_CHAT_COMPLETION({
  messages: [
    { role: "user", content: "Explain quantum computing in simple terms" }
  ]
  // Uses openrouter/auto by default
});

console.log(response.content);
console.log(`Cost: $${response.estimatedCost.total}`);
console.log(`Tokens: ${response.usage.totalTokens}`);

// Use a specific model
const response = await OPENROUTER_CHAT_COMPLETION({
  model: "anthropic/claude-3.5-sonnet",
  messages: [
    { role: "system", content: "You are a helpful coding assistant" },
    { role: "user", content: "Write a Python function to reverse a string" }
  ],
  temperature: 0.7,
  maxTokens: 1000
});

// Use fallback chain for reliability
const response = await OPENROUTER_CHAT_COMPLETION({
  model: "openai/gpt-4o",
  models: ["anthropic/claude-3.5-sonnet", "google/gemini-2.0-flash-exp"],
  messages: [
    { role: "user", content: "Hello!" }
  ]
});
// Tries gpt-4o first, falls back to claude if unavailable, then gemini

// Optimize by provider preferences
const response = await OPENROUTER_CHAT_COMPLETION({
  model: "openai/gpt-4o",
  messages: [{ role: "user", content: "Hello!" }],
  provider: {
    sort: "price", // Prefer cheaper providers
    exclude: ["SomeProvider"] // Exclude specific providers
  }
});
```

### 6. Discover the Streaming Endpoint

If you need to programmatically discover where to send streaming requests, call the metadata tool:

```typescript
const metadata = await OPENROUTER_GET_STREAM_ENDPOINT();

console.log(metadata.chatEndpoint); // e.g. https://openrouter.deco.page/api/chat
console.log(metadata.docs); // Helpful links for OpenRouter streaming + AI SDK usage
```

### 6. Streaming Chat

Use the built-in `POST /api/chat` endpoint for real-time streaming (no tool call required). It accepts the same payload as `OPENROUTER_CHAT_COMPLETION` and returns a text stream that conforms to the [OpenRouter streaming protocol](https://openrouter.ai/docs/api-reference/streaming).

```typescript
// Simple fetch-based client
const response = await fetch("https://your-worker.workers.dev/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "openai/gpt-4o",
    messages: [{ role: "user", content: "Write a long story about a robot" }],
    temperature: 0.9,
  }),
});

const reader = response.body?.getReader();
const decoder = new TextDecoder();

while (reader) {
  const { value, done } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value);
  process.stdout.write(chunk);
}
```

#### Vercel AI SDK compatibility

Because the endpoint is implemented with [`streamText`](https://github.com/vercel/ai), it plugs directly into `useChat`, `useCompletion`, or any handler from the AI SDK:

```typescript
import { useChat } from "ai/react";

export function Chat() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: "/api/chat",
    body: { model: "openai/gpt-4o" },
  });

  return (
    <form onSubmit={handleSubmit}>
      {messages.map((m) => (
        <p key={m.id}>
          <strong>{m.role}:</strong> {m.content}
        </p>
      ))}
      <input value={input} onChange={handleInputChange} />
      <button type="submit">Send</button>
    </form>
  );
}
```

Any SSE-capable client (including `EventSource`, `ReadableStream`, or the official AI SDK helpers) can consume the stream, and the request body supports every option exposed by the OpenRouter API.

## Architecture

### Modular Design

The MCP is organized by feature modules for maintainability and scalability:

```
openrouter/
├── server/
│   ├── main.ts                 # Entry point & runtime config
│   ├── constants.ts            # API endpoints & constants
│   ├── lib/
│   │   ├── openrouter-client.ts   # OpenRouter API client
│   │   └── types.ts               # TypeScript types
│   ├── tools/
│   │   ├── index.ts            # Tool aggregator
│   │   ├── models/             # MODEL DISCOVERY MODULE
│   │   │   ├── list.ts         # List models tool
│   │   │   ├── get.ts          # Get model tool
│   │   │   ├── compare.ts      # Compare models tool
│   │   │   ├── recommend.ts    # Recommend model tool
│   │   │   └── utils.ts        # Model utilities
│   │   └── chat/               # CHAT COMPLETION MODULE
│   │       ├── completion.ts   # Chat completion tool
│   │       ├── start-stream.ts # Start streaming tool
│   │       └── utils.ts        # Chat utilities
│   └── routes/                 # API ROUTES
│       ├── index.ts            # Route aggregator
│       └── stream.ts           # Streaming endpoint
├── shared/
│   └── deco.gen.ts            # Generated types
└── README.md
```

### Tools vs Routes Pattern

- **MCP Tools**: Request/response operations (model discovery, chat completion)
- **API Routes**: Streaming and async operations (SSE streaming chat)
- **Separation**: Tools return data; routes handle real-time streams

### Model Selection Strategies

OpenRouter supports three routing modes:

1. **Single Model**: Direct selection
   ```typescript
   { model: "openai/gpt-4o" }
   ```

2. **Auto Router**: Intelligent selection by NotDiamond
   ```typescript
   { model: "openrouter/auto" }
   ```

3. **Fallback Chain**: Array of models with automatic fallback
   ```typescript
   { 
     model: "openai/gpt-4o",
     models: ["anthropic/claude-3.5-sonnet", "google/gemini-2.0-flash-exp"]
   }
   ```

### Provider Routing

Optimize provider selection by your preferences:

```typescript
{
  provider: {
    sort: "price",              // Sort by: price, throughput, latency
    only: ["OpenAI", "Anthropic"], // Only use these
    exclude: ["SomeProvider"],    // Exclude these
    requireParameters: true,      // Require parameter support
    allowFallbacks: true          // Allow provider fallbacks
  }
}
```

## Cost Optimization

All tools include pricing information to help you optimize costs:

```typescript
// Compare models by cost
const { comparison } = await OPENROUTER_COMPARE_MODELS({
  modelIds: ["openai/gpt-4o", "meta/llama-3-70b"],
  criteria: ["price"]
});

// Get recommendations prioritizing cost
const { recommendations } = await OPENROUTER_RECOMMEND_MODEL({
  taskDescription: "general chatbot",
  requirements: {
    prioritize: "cost",
    maxCostPer1MTokens: 1.0
  }
});

// Every chat completion includes cost estimation
const response = await OPENROUTER_CHAT_COMPLETION({...});
console.log(`Cost: $${response.estimatedCost.total}`);
```

## Error Handling

The MCP includes comprehensive error handling:

- **Network Errors**: Automatic retry with exponential backoff
- **API Errors**: Clear error messages with status codes
- **Validation Errors**: Input validation before API calls
- **Fallback Handling**: Automatic model fallback on failures
- **Rate Limiting**: Proper handling of rate limit errors

## API Reference

### Environment Variables

For local development, create a `.dev.vars` file:

```bash
OPENROUTER_API_KEY=your_api_key_here
```

### OpenRouter API Documentation

- [OpenRouter Quickstart](https://openrouter.ai/docs/quickstart)
- [API Reference](https://openrouter.ai/docs/api-reference/overview)
- [Model Routing](https://openrouter.ai/docs/features/model-routing)
- [Provider Routing](https://openrouter.ai/docs/features/provider-routing)

## Development

### Running Locally

```bash
# Install dependencies
bun install

# Start development server
bun run dev

# Build for production
bun run build

# Deploy to Cloudflare Workers
bun run deploy
```

### Type Generation

```bash
# Generate types from state schema
bun run gen
```

### Type Checking

```bash
# Check TypeScript types
bun run check
```

## Deployment

This MCP is deployed as a Cloudflare Worker:

```bash
# Build and deploy
bun run deploy
```

Configuration is managed through the Deco platform when you install the MCP.

## Best Practices

### 1. **Use Auto-Router by Default**
Let OpenRouter choose the best model for your prompt:
```typescript
{ model: "openrouter/auto" }
```

### 2. **Set Up Fallback Chains**
Ensure reliability with fallbacks:
```typescript
{
  model: "openai/gpt-4o",
  models: ["anthropic/claude-3.5-sonnet", "google/gemini-pro"]
}
```

### 3. **Monitor Costs**
Always check cost estimates:
```typescript
console.log(`Cost: $${response.estimatedCost.total}`);
```

### 4. **Filter Models Appropriately**
Use filters to find the right model:
```typescript
{
  filter: {
    maxPromptPrice: 5.0,
    minContextLength: 100000,
    modality: "text->text"
  }
}
```

### 5. **Use Streaming for Long Responses**
For long-form content, hit `POST /api/chat` with `stream: true` semantics and pipe the response to your UI (see the examples above referencing the [OpenRouter streaming guide](https://openrouter.ai/docs/api-reference/streaming)).

## Limitations

- **Rate Limits**: Depend on your OpenRouter tier
- **Model Availability**: Some models may be temporarily unavailable
- **JSON Mode**: The streaming endpoint forwards `response_format` to OpenRouter, but the AI SDK currently only supports flat JSON schema responses (nested schemas require manual parsing).

## Support

- **OpenRouter Docs**: [openrouter.ai/docs](https://openrouter.ai/docs)
- **MCP Issues**: Report issues in the repository
- **OpenRouter Discord**: Join for community support

## License

This MCP is part of the Deco MCP collection.

## Contributing

Contributions are welcome! Please follow the existing code structure and add tests for new features.

## Changelog

### v1.0.0 - Initial Release
- ✅ Model discovery and filtering
- ✅ Model comparison and recommendations
- ✅ Chat completions (streaming and non-streaming)
- ✅ Auto-routing and fallback chains
- ✅ Provider routing and cost optimization
- ✅ Comprehensive error handling
- ✅ Full TypeScript support

## Related

- [OpenRouter](https://openrouter.ai) - Unified AI model API
- [Deco MCP Platform](https://deco.cx) - MCP hosting and management
- [Model Context Protocol](https://modelcontextprotocol.io) - MCP specification

