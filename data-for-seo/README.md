# DataForSEO MCP

## Project Description

**DataForSEO MCP** is a Model Context Protocol (MCP) server that integrates the DataForSEO API for comprehensive SEO data analysis. This project is hosted as a Cloudflare Workers application.

### Purpose

This MCP server allows client applications to:
- Perform keyword research with search volume and competition data
- Analyze SERP results (organic and news)
- Get backlink analysis and domain metrics
- Track SEO metrics programmatically

### Key Features

- 🔍 **Keyword Research**: Search volume, CPC, competition, and related keywords
- 📊 **SERP Analysis**: Organic and news search results
- 🔗 **Backlink Analysis**: Domain metrics, backlinks, and referring domains
- 🔄 **Real-time Data**: Live API endpoints for immediate results
- 🌐 **Multi-language Support**: Analyze data for different languages and locations
- 🛠️ **MCP Tools**: Easy integration with MCP-compatible AI assistants

## Setup / Installation

### Prerequisites

- Node.js >= 22.0.0
- Bun (package manager)
- Cloudflare account (for deployment)
- DataForSEO account with API credentials

### Local Installation

1. Navigate to the data-for-seo directory:
```bash
cd data-for-seo
```

2. Install dependencies:
```bash
bun install
```

3. Configure required environment variables:
```bash
bun run configure
```

You'll need to provide:
- **login**: Your DataForSEO API Login (email)
- **password**: Your DataForSEO API Password/Token

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

### Deployment

```bash
bun run deploy
```

## Available MCP Tools

### Keywords Tools

#### `DATAFORSEO_GET_SEARCH_VOLUME`
Get search volume, CPC, and competition data for keywords.

**Input:**
```typescript
{
  keywords: string[];           // Array of keywords to analyze
  languageName?: string;        // e.g., "English"
  locationName?: string;        // e.g., "United States"
  languageCode?: string;        // e.g., "en"
  locationCode?: number;        // e.g., 2840 for US
}
```

#### `DATAFORSEO_GET_RELATED_KEYWORDS`
Get keyword suggestions related to a seed keyword.

**Input:**
```typescript
{
  keyword: string;             // Seed keyword (single keyword)
  locationName?: string;       // Default: "United States"
  languageName?: string;       // Default: "English"
  locationCode?: number;       // Alternative to locationName
  languageCode?: string;       // Alternative to languageName
  depth?: number;              // 1-10
  limit?: number;
}
```

### SERP Tools

#### `DATAFORSEO_GET_ORGANIC_SERP`
Get organic search results from Google SERP.

**Input:**
```typescript
{
  keyword: string;
  languageCode?: string;
  locationCode?: number;
  device?: "desktop" | "mobile";
  depth?: number;
}
```

#### `DATAFORSEO_GET_NEWS_SERP`
Get Google News search results.

**Input:**
```typescript
{
  keyword: string;
  languageCode?: string;
  locationCode?: number;
  sortBy?: "relevance" | "date";
  timeRange?: "all" | "1h" | "1d" | "1w" | "1m" | "1y";
}
```

### Backlinks Tools

#### `DATAFORSEO_GET_BACKLINKS_OVERVIEW`
Get an overview of backlinks data for a domain.

**Input:**
```typescript
{
  target: string;              // Domain or URL
}
```

#### `DATAFORSEO_GET_BACKLINKS`
Get a detailed list of backlinks for a domain or URL.

**Input:**
```typescript
{
  target: string;
  limit?: number;
  offset?: number;
}
```

#### `DATAFORSEO_GET_REFERRING_DOMAINS`
Get list of domains linking to target.

**Input:**
```typescript
{
  target: string;
  limit?: number;
  offset?: number;
}
```

## Usage Examples

### Get Keyword Search Volume

```typescript
// MCP Client
const result = await client.callTool("DATAFORSEO_GET_SEARCH_VOLUME", {
  keywords: ["seo tools", "keyword research"],
  languageName: "English",
  locationName: "United States"
});
```

### Analyze SERP Results

```typescript
const serp = await client.callTool("DATAFORSEO_GET_ORGANIC_SERP", {
  keyword: "digital marketing",
  languageCode: "en",
  locationCode: 2840,
  depth: 10
});
```

### Get Domain Backlinks

```typescript
const backlinks = await client.callTool("DATAFORSEO_GET_BACKLINKS_OVERVIEW", {
  target: "example.com"
});
```

## Configuration Details

### File Structure

```
data-for-seo/
├── server/              # MCP server code
│   ├── main.ts         # Main entry point
│   ├── constants.ts    # API constants
│   ├── lib/            # Client libraries
│   │   └── dataforseo.ts # DataForSEO API client
│   └── tools/          # MCP tools
│       ├── index.ts    # Tools aggregator
│       ├── keywords.ts # Keyword tools
│       ├── serp.ts     # SERP tools
│       └── backlinks.ts # Backlink tools
├── shared/             # Shared code
│   └── deco.gen.ts    # Generated types
├── package.json
├── tsconfig.json
├── vite.config.ts
└── wrangler.toml
```

### Environment Variables

The project requires the following credentials:

- `DATAFORSEO_LOGIN`: Your DataForSEO account login (email)
- `DATAFORSEO_PASSWORD`: Your DataForSEO account password

These are configured through the State Schema when installing the app.

### Available Scripts

- `bun run dev` - Starts development server with hot reload
- `bun run configure` - Configures the Deco project
- `bun run gen` - Generates TypeScript types
- `bun run build` - Compiles for production
- `bun run deploy` - Deploys to Cloudflare Workers
- `bun run check` - Type checks TypeScript without compiling

### API Endpoints

- `/mcp` - MCP server endpoint
- All other requests fallback to static assets

### Rate Limits

DataForSEO has rate limits based on your subscription plan. Be aware of:
- Concurrent request limits
- Daily/monthly request quotas
- Cost per API call (varies by endpoint)

Check your DataForSEO dashboard for current usage and limits.

## Technologies Used

- **Runtime**: Cloudflare Workers
- **MCP Framework**: Deco Workers Runtime
- **Build Tool**: Vite
- **Validation**: Zod
- **Language**: TypeScript
- **API**: DataForSEO v3

## Getting DataForSEO Credentials

### Important: Use API Credentials, Not Account Password!

DataForSEO uses **separate API credentials** for authentication, not your account email/password.

1. **Sign up** at https://dataforseo.com
2. **Log in** to your DataForSEO dashboard
3. **Get API Credentials** at https://app.dataforseo.com/api-access
   - You'll see your **API Login** (usually looks like: `your-email@example.com`)
   - You'll see your **API Password** (a generated token, NOT your account password)
4. **Copy both credentials** and use them when configuring this MCP

⚠️ **Common Mistake**: Don't use your account password! Use the API password from the API Access page.

### Troubleshooting Authentication

If you get error 40100 (Not Authorized):
- ✅ Make sure you're using the API credentials from https://app.dataforseo.com/api-access
- ✅ Verify your API Login (email) is correct
- ✅ Use the API Password (token), NOT your account password
- ✅ Check if your DataForSEO account has sufficient credits

## License

Private - All rights reserved
