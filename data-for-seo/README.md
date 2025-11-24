# DataForSEO MCP

## Project Description

**DataForSEO MCP** is a Model Context Protocol (MCP) server that integrates the DataForSEO API for comprehensive SEO data analysis. This project is hosted as a Cloudflare Workers application.

### Purpose

This MCP server allows client applications to:
- Perform keyword research with search volume and competition data
- Analyze SERP results (organic and news)
- Get backlink analysis and domain metrics
- Access traffic analytics and sources breakdown
- Track SEO metrics programmatically

### Key Features

- 🔍 **Keyword Research**: Search volume, CPC, competition, and related keywords
- 📊 **SERP Analysis**: Organic and news search results
- 🔗 **Backlink Analysis**: Domain metrics, backlinks, and referring domains
- 📈 **Traffic Analytics**: Overview, sources, countries, and page-level traffic data
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
- **DATAFORSEO_LOGIN**: Your DataForSEO account email
- **DATAFORSEO_PASSWORD**: Your DataForSEO account password

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
Get keyword suggestions related to seed keywords.

**Input:**
```typescript
{
  keywords: string[];           // Seed keywords
  languageName?: string;
  locationName?: string;
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

### Traffic Tools

#### `DATAFORSEO_GET_TRAFFIC_OVERVIEW`
Get website traffic overview metrics.

**Input:**
```typescript
{
  target: string;              // Domain
}
```

#### `DATAFORSEO_GET_TRAFFIC_BY_SOURCES`
Get traffic breakdown by source.

**Input:**
```typescript
{
  target: string;
}
```

#### `DATAFORSEO_GET_TRAFFIC_BY_COUNTRY`
Get traffic distribution by country.

**Input:**
```typescript
{
  target: string;
  limit?: number;
  offset?: number;
}
```

#### `DATAFORSEO_GET_TRAFFIC_BY_PAGES`
Get traffic metrics for individual pages.

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

### Analyze Website Traffic

```typescript
const traffic = await client.callTool("DATAFORSEO_GET_TRAFFIC_OVERVIEW", {
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
│       ├── backlinks.ts # Backlink tools
│       └── traffic.ts  # Traffic tools
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

1. Visit https://dataforseo.com
2. Sign up for an account
3. Get your login (email) and password from your account settings
4. Use these credentials when configuring the MCP server

## License

Private - All rights reserved
