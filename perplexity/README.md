# Perplexity AI MCP

## Project Description

**Perplexity AI MCP** is a Model Context Protocol (MCP) server that integrates the Perplexity AI API to provide web-grounded answers. This project is hosted as a Cloudflare Workers application.

### Purpose

This MCP server allows client applications to:
- Ask questions in natural language and receive web-grounded answers
- Conduct multi-turn conversations with message history context
- Customize search parameters (domains, recency, context)
- Use different Perplexity models (sonar, sonar-pro, etc.)
- Control response generation (temperature, tokens, etc.)

### Key Features

- 🤖 **Perplexity AI Integration**: Full access to the Perplexity API
- 💬 **Two Interaction Modes**: Simple prompt or multi-turn conversation
- 🔍 **Custom Search**: Domain, recency, and context filters
- 🎯 **Multiple Models**: Support for sonar, sonar-pro, sonar-deep-research, sonar-reasoning-pro, and sonar-reasoning
- ⚙️ **Fine Control**: Adjust temperature, top_p, max_tokens, and much more
- 💰 **Contract System**: Authorization and payment management per query
- 🔄 **Automatic Retry**: Retry system with up to 3 attempts
- ⏱️ **Configurable Timeout**: Protection against long requests
- 👤 **User Tools**: User information management
- 📊 **Usage Information**: Returns token count used

## Configuration / Installation

### Prerequisites

- Node.js >= 22.0.0
- Bun (package manager)
- Cloudflare account (for deployment)
- Perplexity API key (get it at https://www.perplexity.ai/settings/api)

### Local Installation

1. Clone the repository and enter the Perplexity directory:
```bash
git clone https://github.com/deco-cx/mcps.git
cd mcps/perplexity
```

2. Install dependencies:
```bash
bun install
```

3. Configure the necessary environment variables:
```bash
bun run configure
```

4. Generate TypeScript types:
```bash
bun run gen
```

5. Start the development server:
```bash
bun run dev
```

The server will be available at `http://localhost:8787` (default Cloudflare Workers port).

### Production Build

```bash
bun run build
```

### Deploy

```bash
bun run deploy
```

## Usage Examples

### Ask a Simple Question

```typescript
// MCP Client
const result = await client.callTool("ask_perplexity", {
  prompt: "What is the capital of France and its current population?"
});

// Result
{
  answer: "The capital of France is Paris, with a metropolitan population...",
  usage: {
    prompt_tokens: 15,
    completion_tokens: 120,
    total_tokens: 135
  }
}
```

### Multi-Turn Conversation

```typescript
const result = await client.callTool("chat_with_perplexity", {
  messages: [
    { role: "user", content: "What is artificial intelligence?" },
    { role: "assistant", content: "AI is the simulation of processes..." },
    { role: "user", content: "What are the main applications?" }
  ]
});
```

### Search with Custom Filters

```typescript
const result = await client.callTool("ask_perplexity", {
  prompt: "Latest news about technology",
  search_recency_filter: "day",
  search_domain_filter: ["techcrunch.com", "theverge.com"],
  search_context_size: "maximum",
  model: "sonar-pro"
});
```

### Use Reasoning Model

```typescript
const result = await client.callTool("ask_perplexity", {
  prompt: "Explain the Pythagorean theorem and how to prove it",
  model: "sonar-reasoning-pro",
  temperature: 0.1
});
```

### Error Handling

```typescript
try {
  const result = await client.callTool("ask_perplexity", {
    prompt: "My question..."
  });
  console.log(result.answer);
} catch (error) {
  console.error("Error querying Perplexity:", error.message);
}
```

## Configuration Details

### File Structure

```
perplexity/
├── server/              # MCP server code
│   ├── main.ts         # Main entry point
│   ├── constants.ts    # Constants (base URLs, etc)
│   ├── lib/            # Libraries
│   │   ├── types.ts    # TypeScript type definitions
│   │   └── perplexity-client.ts # Perplexity API client
│   └── tools/          # MCP tools
│       ├── index.ts    # Tool aggregator
│       └── perplexity.ts # Perplexity tools
└── shared/             # Shared code
    └── deco.gen.ts    # Generated types
```

### Environment Variables / Bindings

The project uses the following Cloudflare Workers bindings:

#### `PERPLEXITY_API_KEY`
Perplexity AI API key:
- Get your key at: https://www.perplexity.ai/settings/api
- Configure during integration installation

#### `DEFAULT_MODEL`
Default model to use (optional):
- Options: `sonar`, `sonar-pro`, `sonar-deep-research`, `sonar-reasoning-pro`, `sonar-reasoning`
- Default: `sonar`

#### `PERPLEXITY_CONTRACT`
Authorization and pay-per-use system:
- `CONTRACT_AUTHORIZE`: Authorizes a transaction before the query
- `CONTRACT_SETTLE`: Settles the transaction after the query
- **Configured clauses:**
  - `perplexity:ask`: $0.01 per simple question
  - `perplexity:chat`: $0.02 per chat message

#### `FILE_SYSTEM`
File storage system:
- `FS_READ`: Reads files from the file system
- `FS_WRITE`: Writes files to the file system

### OAuth Configuration

The project supports OAuth for authentication. Configure the necessary scopes in `server/main.ts`:

```typescript
oauth: {
  scopes: [
    Scopes.PERPLEXITY_CONTRACT.CONTRACT_AUTHORIZE,
    Scopes.PERPLEXITY_CONTRACT.CONTRACT_SETTLE,
    Scopes.FILE_SYSTEM.FS_READ,
    Scopes.FILE_SYSTEM.FS_WRITE,
  ],
  state: StateSchema,
}
```

### State Schema

The State Schema defines the installed application state. You can extend it to add custom fields:

```typescript
const StateSchema = BaseStateSchema.extend({
  PERPLEXITY_API_KEY: z.string(),
  DEFAULT_MODEL: z.enum([...]).optional(),
  // other fields...
})
```

### Available Scripts

- `bun run dev` - Starts development server with hot reload
- `bun run configure` - Configures the Deco project
- `bun run gen` - Generates TypeScript types
- `bun run build` - Compiles for production
- `bun run deploy` - Deploys to Cloudflare Workers
- `bun run check` - Checks TypeScript types without compiling

### Available MCP Tools

#### `ask_perplexity`
Asks a simple question to Perplexity AI.

**Parameters:**
- `prompt` (string, required): The question or prompt
- `model` (string, optional): Model to use (default: "sonar")
- `max_tokens` (number, optional): Maximum tokens in the response
- `temperature` (number, optional): Controls randomness (0-2, default: 0.2)
- `top_p` (number, optional): Controls diversity (0-1, default: 0.9)
- `search_domain_filter` (string[], optional): Limits search to specific domains (max 3)
- `return_images` (boolean, optional): Include images in results
- `return_related_questions` (boolean, optional): Return related questions
- `search_recency_filter` (string, optional): Filter by time ("week", "day", "month")
- `search_context_size` (string, optional): Amount of context ("low", "medium", "high", "maximum")

#### `chat_with_perplexity`
Maintains a multi-turn conversation with Perplexity AI.

**Parameters:**
- `messages` (Message[], required): Array of conversation messages
  - Each message: `{ role: "system" | "user" | "assistant", content: string }`
- All other parameters from `ask_perplexity` are also available

### Available Models

- **sonar**: Default model, fast and efficient
- **sonar-pro**: Premium version with more detailed responses
- **sonar-deep-research**: For in-depth research and complex analysis
- **sonar-reasoning-pro**: For advanced reasoning and logic
- **sonar-reasoning**: For tasks requiring reasoning

### Input/Output Format

#### Input (`ask_perplexity`)
```typescript
{
  prompt: string;
  model?: "sonar" | "sonar-pro" | ...;
  temperature?: number;
  max_tokens?: number;
  // ... other parameters
}
```

#### Output
```typescript
{
  content: [{
    type: "text",
    text: string // Stringified JSON with answer, usage, etc
  }]
}
```

JSON format:
```typescript
{
  answer: string;              // Generated answer
  model?: string;              // Model used
  finish_reason?: string;      // Completion reason
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  }
}
```

### Endpoints

- `/mcp` - MCP server endpoint
- All other requests fallback to static assets

## Technologies Used

- **Runtime**: Cloudflare Workers
- **MCP Framework**: Deco Workers Runtime
- **Build Tool**: Vite
- **Validation**: Zod
- **Language**: TypeScript

## License

MIT
