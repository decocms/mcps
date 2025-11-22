# Search AI Tools Factory

Factory for creating standardized MCP tools for Search AI providers like Perplexity, ChatGPT Search, Google Gemini, and others.

## Overview

This module provides a consistent interface for integrating various search AI providers into your MCP server. It handles common concerns like:

- **Standardized API**: Consistent interface across different providers
- **Error Handling**: Automatic retry and timeout logic
- **Contract Management**: Optional payment/authorization system
- **Logging**: Built-in operation logging
- **Type Safety**: Full TypeScript support with Zod schemas

## Supported Use Cases

- **Simple Q&A**: Ask a single question and get web-backed answers
- **Multi-turn Chat**: Maintain conversation context across multiple messages
- **Web Search Integration**: Access to real-time web information
- **Source Citations**: Optional source URLs and snippets

## Usage

### Basic Example

```typescript
import { createSearchAITools } from "@decocms/mcps-shared/search-ai";
import { MySearchAIClient } from "./my-client";

export const mySearchTools = createSearchAITools({
  metadata: {
    provider: "My Search AI",
    description: "Search AI powered by My Provider",
  },
  getClient: (env) => new MySearchAIClient({ apiKey: env.state.API_KEY }),
  askTool: {
    execute: async ({ client, input }) => {
      const response = await client.ask(input.prompt);
      return {
        answer: response.text,
        usage: response.usage,
      };
    },
  },
  chatTool: {
    execute: async ({ client, input }) => {
      const response = await client.chat(input.messages);
      return {
        answer: response.text,
        model: response.model,
        usage: response.usage,
      };
    },
  },
});
```

### With Contract Management

```typescript
export const mySearchTools = createSearchAITools({
  metadata: {
    provider: "My Search AI",
  },
  getClient: (env) => new MySearchAIClient({ apiKey: env.state.API_KEY }),
  askTool: {
    execute: async ({ client, input }) => {
      // ... implementation
    },
    getContract: (env) => ({
      binding: env.MY_CONTRACT,
      clause: {
        clauseId: "search-ai:ask",
        amount: 1,
      },
    }),
  },
  chatTool: {
    execute: async ({ client, input }) => {
      // ... implementation
    },
    getContract: (env) => ({
      binding: env.MY_CONTRACT,
      clause: {
        clauseId: "search-ai:chat",
        amount: 2,
      },
    }),
  },
});
```

### Custom Configuration

```typescript
export const mySearchTools = createSearchAITools({
  metadata: {
    provider: "My Search AI",
  },
  getClient: (env) => new MySearchAIClient({ apiKey: env.state.API_KEY }),
  maxRetries: 5,           // Default: 3
  timeoutMs: 120_000,      // Default: 60000 (1 minute)
  askTool: { /* ... */ },
  chatTool: { /* ... */ },
});
```

## API Reference

### `createSearchAITools<TEnv, TClient>(options)`

Creates a set of search AI tools for your MCP server.

#### Options

- **`metadata`** (required)
  - `provider: string` - Name of the search AI provider
  - `description?: string` - Optional description for the tools

- **`getClient`** (required)
  - Function that returns your search AI client instance
  - Receives the environment object

- **`askTool`** (required)
  - `execute` - Function to execute a simple question
  - `inputSchema?` - Optional custom input schema (defaults to `AskInputSchema`)
  - `getContract?` - Optional contract configuration

- **`chatTool`** (required)
  - `execute` - Function to execute a multi-turn chat
  - `inputSchema?` - Optional custom input schema (defaults to `ChatInputSchema`)
  - `getContract?` - Optional contract configuration

- **`maxRetries?`** (optional, default: 3)
  - Number of retry attempts on failure

- **`timeoutMs?`** (optional, default: 60000)
  - Timeout in milliseconds for each operation

### Input Schemas

#### `AskInput`

```typescript
{
  prompt: string;
  model?: string;
  max_tokens?: number;
  temperature?: number;      // 0-2
  top_p?: number;            // 0-1
  search_domain_filter?: string[];
  search_recency_filter?: string;
  search_context_size?: "low" | "medium" | "high" | "maximum";
  return_images?: boolean;
  return_related_questions?: boolean;
}
```

#### `ChatInput`

```typescript
{
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
  model?: string;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  // ... same search options as AskInput
}
```

### Output Schema

```typescript
{
  answer: string;
  model?: string;
  finish_reason?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  sources?: Array<{
    title?: string;
    url: string;
    snippet?: string;
  }>;
  related_questions?: string[];
  images?: Array<{
    url: string;
    description?: string;
  }>;
}
```

## Examples

See the following implementations for real-world examples:

- `perplexity/` - Perplexity AI integration
- Coming soon: ChatGPT Search, Google Gemini, and more

## Provider Compatibility

This factory is designed to work with any search AI provider that offers:

- Text-based Q&A or chat completions
- Web search capabilities
- Optional: Source citations
- Optional: Related questions
- Optional: Image results

### Compatible Providers

- ✅ Perplexity AI
- ✅ ChatGPT Search (OpenAI)
- ✅ Google Gemini
- ✅ Anthropic Claude (with search)
- ✅ You.com
- ✅ Phind
- ✅ Custom search AI implementations

## Error Handling

The factory automatically handles:

- **Retries**: Failed requests are retried up to `maxRetries` times
- **Timeouts**: Operations timeout after `timeoutMs` milliseconds
- **Logging**: All operations are logged with start/end timestamps
- **Graceful Errors**: Errors are caught and formatted consistently

## Best Practices

1. **Client Management**: Create lightweight clients that handle API communication
2. **Error Messages**: Return descriptive error messages in `SearchAICallbackOutputError`
3. **Usage Tracking**: Always include token usage information when available
4. **Source Citations**: Include sources to improve transparency
5. **Model Selection**: Allow users to choose models when your provider supports multiple

## License

MIT

