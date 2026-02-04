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
- Bun runtime and package manager
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

3. Configure your DataForSEO credentials in the MCP Mesh UI or set them directly:
   - **API Login**: Your DataForSEO API Login (from https://app.dataforseo.com/api-access)
   - **API Password**: Your DataForSEO API Token (NOT your account password)

4. Start the development server:
```bash
bun run dev
```

The server will start with hot reload enabled.

### Production Build

```bash
bun run build
```

This creates a production bundle at `dist/server/main.js`.

### Available Scripts

- `bun run dev` - Start development server with hot reload
- `bun run build` - Build for production
- `bun run check` - Type check TypeScript without compiling

## Available MCP Tools

> **⚠️ Important:** All tools are **ASYNCHRONOUS** and make live API calls to DataForSEO. Response times vary from 2-10 seconds depending on the endpoint.

### Keywords Tools (2 tools)

#### `DATAFORSEO_GET_SEARCH_VOLUME` 
**[ASYNC - Standard Plan]** Get search volume, CPC, and competition data for up to 1000 keywords at once.

**Response Time:** 2-5 seconds  
**Cost:** ~0.002 credits per keyword  
**Plan Required:** All plans

**Input:**
```typescript
{
  keywords: string[];           // Array of keywords to analyze (max 1000)
  languageName?: string;        // e.g., "English"
  locationName?: string;        // e.g., "United States"
  languageCode?: string;        // e.g., "en"
  locationCode?: number;        // e.g., 2840 for US
}
```

**Returns:** Search volume, CPC, competition level, monthly trends

---

#### `DATAFORSEO_GET_RELATED_KEYWORDS` 
**[ASYNC - DataForSEO Labs]** Get keyword suggestions with semantic relationships.

**Response Time:** 3-10 seconds  
**Cost:** ~0.1 credits per request  
**Plan Required:** All plans (higher cost)

**Input:**
```typescript
{
  keyword: string;             // Seed keyword (single keyword)
  locationName?: string;       // Default: "United States"
  languageName?: string;       // Default: "English"
  locationCode?: number;       // Alternative to locationName
  languageCode?: string;       // Alternative to languageName
  depth?: number;              // 1-10 (keyword expansion depth)
  limit?: number;              // Max results (default: 100)
}
```

**Returns:** Up to 1000 related keywords with search volume, competition, and SERP data

---

### SERP Tools (2 tools)

#### `DATAFORSEO_GET_ORGANIC_SERP`
**[ASYNC - Live SERP]** Get real-time organic search results from Google.

**Response Time:** 3-8 seconds  
**Cost:** ~0.003 credits per request  
**Plan Required:** All plans

**Input:**
```typescript
{
  keyword: string;
  languageCode?: string;        // e.g., "en"
  locationCode?: number;        // e.g., 2840 for US
  device?: "desktop" | "mobile";
  depth?: number;               // Number of results (default: 100)
}
```

**Returns:** Rankings, URLs, titles, descriptions, SERP features (featured snippets, knowledge panels)

---

#### `DATAFORSEO_GET_NEWS_SERP`
**[ASYNC - Live SERP]** Get real-time Google News results.

**Response Time:** 2-5 seconds  
**Cost:** ~0.003 credits per request  
**Plan Required:** All plans

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

**Returns:** News articles with titles, sources, timestamps, snippets, thumbnails

---

### Backlinks Tools (3 tools)

#### `DATAFORSEO_GET_BACKLINKS_OVERVIEW`
**[ASYNC - Backlinks Summary]** Get comprehensive backlinks overview for any domain.

**Response Time:** 2-4 seconds  
**Cost:** ~0.05 credits per request  
**Plan Required:** All plans

**Input:**
```typescript
{
  target: string;              // Domain or URL (e.g., "example.com")
}
```

**Returns:** Total backlinks, referring domains, dofollow/nofollow ratio, gov/edu domains, domain rank, broken backlinks

---

#### `DATAFORSEO_GET_BACKLINKS`
**[ASYNC - Detailed Backlinks]** Get paginated list of individual backlinks.

**Response Time:** 3-8 seconds  
**Cost:** ~0.05 credits per request  
**Plan Required:** All plans

**Input:**
```typescript
{
  target: string;
  limit?: number;              // Max 1000 per request
  offset?: number;             // For pagination
}
```

**Returns:** Source URL, anchor text, dofollow/nofollow status, domain rank, first seen date

---

#### `DATAFORSEO_GET_REFERRING_DOMAINS`
**[ASYNC - Referring Domains]** Get paginated list of unique domains linking to target.

**Response Time:** 3-8 seconds  
**Cost:** ~0.05 credits per request  
**Plan Required:** All plans

**Input:**
```typescript
{
  target: string;
  limit?: number;              // Max 1000 per request
  offset?: number;             // For pagination
}
```

**Returns:** Domain name, domain rank, backlinks count, dofollow/nofollow counts, first seen date

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
│   ├── types/          # TypeScript types
│   │   └── env.ts      # Environment & state schema
│   ├── lib/            # Client libraries
│   │   └── dataforseo.ts # DataForSEO API client
│   └── tools/          # MCP tools
│       ├── index.ts    # Tools aggregator
│       ├── schemas.ts  # Zod schemas
│       ├── keywords.ts # Keyword tools (2 tools)
│       ├── serp.ts     # SERP tools (2 tools)
│       └── backlinks.ts # Backlink tools (3 tools)
├── package.json
├── tsconfig.json
└── README.md
```

### Configuration Schema

The MCP is configured through the Mesh UI with the following fields:

```typescript
{
  API_CREDENTIALS: {
    login: string;      // DataForSEO API Login
    password: string;   // DataForSEO API Token
  }
}
```

**Important:** Use the API credentials from https://app.dataforseo.com/api-access, NOT your account password!

### Rate Limits & Performance

DataForSEO has rate limits based on your subscription plan. Be aware of:
- **Concurrent request limits**: Typically 2-5 simultaneous requests
- **Daily/monthly request quotas**: Varies by plan
- **Cost per API call**: See individual tool documentation above
- **Response times**: All tools are async and take 2-10 seconds

Check your DataForSEO dashboard for current usage and limits: https://app.dataforseo.com/

### Best Practices for LLMs

When using these tools in AI workflows:

1. **Always use async/await**: All tools return Promises and require waiting
2. **Handle rate limits**: Don't make more than 2-3 concurrent requests
3. **Batch keywords**: Use `GET_SEARCH_VOLUME` with multiple keywords instead of separate calls
4. **Use pagination**: For backlinks tools, fetch data in chunks using limit/offset
5. **Cache results**: DataForSEO data changes slowly; cache for 24-48 hours when possible
6. **Monitor credits**: Each call consumes credits; check costs in tool descriptions

## Technologies Used

- **Runtime**: Bun
- **MCP Framework**: @decocms/runtime v1.2.5
- **Build Tool**: Bun native bundler
- **Validation**: Zod v4
- **Language**: TypeScript 5.7
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
