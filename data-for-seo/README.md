# DataForSEO MCP

## Project Description

**DataForSEO MCP** is a Model Context Protocol (MCP) server that integrates the DataForSEO API for comprehensive SEO data analysis. This project is hosted as a Cloudflare Workers application.

### Purpose

This MCP server allows client applications to:
- Perform comprehensive keyword research and competitive analysis
- Analyze SERP results (organic, news, and historical trends)
- Get backlink analysis and domain authority metrics
- Discover competitors and ranked keywords automatically
- Track SEO metrics and trends programmatically

### Key Features

- 🔍 **Keyword Research**: Search volume, difficulty, trends, suggestions, and ideas (6 tools)
- 📊 **SERP Analysis**: Organic, news, and historical SERP data (3 tools)
- 🎯 **Domain Analysis**: Ranked keywords, authority, and competitor discovery (3 tools)
- 🔗 **Backlink Analysis**: Overview, detailed backlinks, and referring domains (3 tools)
- 🔄 **Real-time Data**: Live API endpoints with 2-15 second response times
- 🌐 **Multi-language Support**: Analyze data for different languages and locations
- 💰 **Pay-as-you-go**: All tools work with credit-based pricing (no monthly plans required)
- 🛠️ **MCP Tools**: 15 tools total, easy integration with MCP-compatible AI assistants

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

> **⚠️ Important:** All tools are **ASYNCHRONOUS** and make live API calls to DataForSEO. Response times vary from 2-15 seconds depending on the endpoint.

### 📊 Summary: 15 Tools Total

| Category | Tools | Best For |
|----------|-------|----------|
| **Keywords** (4) | Search Volume, Related Keywords, Trends, Difficulty | Keyword research, trends, and difficulty analysis |
| **Domain Analysis** (3) | Ranked Keywords, Domain Rank, Competitors | Competitive intelligence and domain authority |
| **Keyword Suggestions** (2) | Autocomplete Suggestions, Keyword Ideas | Long-tail discovery and content ideation |
| **SERP** (3) | Organic SERP, News SERP, Historical SERP | Ranking analysis and SERP tracking |
| **Backlinks** (3) | Overview, Backlinks List, Referring Domains | Link building and domain authority |

---

### Keywords Tools (4 tools)

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

#### `DATAFORSEO_GOOGLE_TRENDS` 
**[ASYNC - Standard Plan]** Get Google Trends data for up to 5 keywords including interest over time, regional interest, and related queries.

**Response Time:** 3-8 seconds  
**Cost:** ~0.01 credits per request (very affordable!)  
**Plan Required:** All plans

**Input:**
```typescript
{
  keywords: string[];              // 1-5 keywords to compare trends
  locationName?: string;           // Default: "United States"
  locationCode?: number;           // Alternative to locationName
  timeRange?: string;              // "now 1-d", "now 7-d", "today 1-m", "today 3-m", 
                                   // "today 12-m", "today 5-y", "2004-present"
  category?: number;               // Category ID (0 = All categories)
}
```

**Returns:** Interest over time (trend graphs), regional interest by location, related queries, rising queries

**Use Cases:**
- Track keyword popularity trends over time
- Identify seasonal patterns in search behavior
- Compare multiple keywords trending patterns
- Find trending related queries
- Analyze regional interest distribution

---

#### `DATAFORSEO_KEYWORD_DIFFICULTY` 
**[ASYNC - DataForSEO Labs]** Get keyword difficulty scores (0-100) for up to 100 keywords at once.

**Response Time:** 3-10 seconds  
**Cost:** ~0.05 credits per keyword (excellent value!)  
**Plan Required:** All plans (DataForSEO Labs)

**Input:**
```typescript
{
  keywords: string[];              // 1-100 keywords to analyze
  languageName?: string;           // Default: "English"
  locationName?: string;           // Default: "United States"
  languageCode?: string;           // Alternative to languageName
  locationCode?: number;           // Alternative to locationName
}
```

**Returns:** Difficulty score (0-100, lower = easier to rank), competitive metrics, top-ranking domains, ranking complexity analysis

**Difficulty Score Interpretation:**
- **0-20**: Very Easy - Low competition, great for new websites
- **21-40**: Easy - Moderate competition, achievable with good content
- **41-60**: Medium - Competitive, requires SEO strategy
- **61-80**: Hard - Highly competitive, established sites dominate
- **81-100**: Very Hard - Extremely competitive, major brands/authority sites

**Use Cases:**
- Evaluate keyword competitiveness before targeting
- Build content strategy around low-difficulty keywords
- Prioritize keyword opportunities by difficulty vs. search volume
- Competitive analysis for SEO planning
- Batch analyze keyword lists for content calendars

---

### Domain Analysis Tools (3 tools)

#### `DATAFORSEO_RANKED_KEYWORDS` 
**[ASYNC - DataForSEO Labs]** Get ALL keywords a domain ranks for in Google with positions, search volume, and estimated traffic.

**Response Time:** 5-15 seconds  
**Cost:** ~0.02 credits per request (excellent value!)  
**Plan Required:** All plans (DataForSEO Labs)

**Input:**
```typescript
{
  target: string;                  // Domain to analyze (e.g., "example.com")
  languageName?: string;           // Default: "English"
  locationName?: string;           // Default: "United States"
  languageCode?: string;           // Alternative to languageName
  locationCode?: number;           // Alternative to locationName
  limit?: number;                  // Max 1000 per request
  offset?: number;                 // For pagination
}
```

**Returns:** Complete list of keywords with rankings (position 1-100), search volume, CPC, traffic estimates, URL that ranks

**Use Cases:**
- Discover ALL keywords a competitor ranks for
- Find keyword gaps between your site and competitors
- Identify low-hanging fruit opportunities (high volume, low competition)
- Content strategy based on competitor success
- Estimate organic traffic for any domain

---

#### `DATAFORSEO_DOMAIN_RANK` 
**[ASYNC - DataForSEO Labs]** Get comprehensive domain authority metrics and organic performance overview.

**Response Time:** 2-5 seconds  
**Cost:** ~0.01 credits per request (very affordable!)  
**Plan Required:** All plans (DataForSEO Labs)

**Input:**
```typescript
{
  target: string;                  // Domain to analyze (e.g., "example.com")
}
```

**Returns:** Domain rank score, total organic keywords count, estimated traffic, organic cost (traffic value), visibility score

**Use Cases:**
- Quick domain authority assessment
- Compare domain strength across competitors
- Track domain growth over time
- Complement backlink data with authority metrics
- Evaluate potential link partners or acquisition targets

---

#### `DATAFORSEO_COMPETITORS_DOMAIN` 
**[ASYNC - DataForSEO Labs]** Automatically discover competitor domains based on common keyword rankings.

**Response Time:** 5-12 seconds  
**Cost:** ~0.05 credits per request (great value!)  
**Plan Required:** All plans (DataForSEO Labs)

**Input:**
```typescript
{
  target: string;                  // Your domain (e.g., "yoursite.com")
  languageName?: string;           // Default: "English"
  locationName?: string;           // Default: "United States"
  languageCode?: string;           // Alternative to languageName
  locationCode?: number;           // Alternative to locationName
  limit?: number;                  // Max 100 competitors
}
```

**Returns:** List of competitor domains with common keywords count, organic keywords overlap, estimated traffic, competitive metrics

**Use Cases:**
- Automated competitor discovery (no manual research!)
- Identify direct and indirect competitors
- Analyze keyword overlap and competitive gaps
- Build competitive intelligence reports
- Find new market opportunities

---

### Keyword Suggestions Tools (2 tools)

#### `DATAFORSEO_KEYWORD_SUGGESTIONS` 
**[ASYNC - Standard Plan]** Get keyword suggestions from Google Autocomplete with search volume data.

**Response Time:** 2-5 seconds  
**Cost:** ~0.003 credits per request (extremely affordable!)  
**Plan Required:** All plans

**Input:**
```typescript
{
  keyword: string;                 // Seed keyword for suggestions
  languageName?: string;           // Default: "English"
  locationName?: string;           // Default: "United States"
  languageCode?: string;           // Alternative to languageName
  locationCode?: number;           // Alternative to locationName
  limit?: number;                  // Max 1000 suggestions
}
```

**Returns:** Google Autocomplete suggestions with search volume, CPC, competition data

**Use Cases:**
- Discover long-tail keyword variations
- Understand how users actually search
- Content ideation based on user intent
- PPC campaign keyword expansion
- Voice search optimization (natural language queries)

---

#### `DATAFORSEO_KEYWORD_IDEAS` 
**[ASYNC - Standard Plan]** Get keyword ideas using Google's internal keyword matching algorithm.

**Response Time:** 3-8 seconds  
**Cost:** ~0.003 credits per request (very cheap!)  
**Plan Required:** All plans

**Input:**
```typescript
{
  keywords: string[];              // 1-5 seed keywords
  languageName?: string;           // Default: "English"
  locationName?: string;           // Default: "United States"
  languageCode?: string;           // Alternative to languageName
  locationCode?: number;           // Alternative to locationName
  limit?: number;                  // Max 1000 ideas
}
```

**Returns:** Related keyword ideas with search volume, competition, CPC, and relevance metrics

**Use Cases:**
- Alternative to Related Keywords (different algorithm)
- Keyword brainstorming for content clusters
- Discover semantic keyword variations
- PPC campaign planning
- Content gap analysis

---

### SERP Tools (3 tools)

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

#### `DATAFORSEO_HISTORICAL_SERP`
**[ASYNC - DataForSEO Labs]** Get historical SERP ranking data showing how rankings changed over time.

**Response Time:** 5-12 seconds  
**Cost:** ~0.05 credits per request  
**Plan Required:** All plans (DataForSEO Labs)

**Input:**
```typescript
{
  keyword: string;
  languageName?: string;           // Default: "English"
  locationName?: string;           // Default: "United States"
  languageCode?: string;           // Alternative to languageName
  locationCode?: number;           // Alternative to locationName
  dateFrom?: string;               // YYYY-MM-DD (default: 30 days ago)
  dateTo?: string;                 // YYYY-MM-DD (default: today)
}
```

**Returns:** Historical ranking data showing position changes for top domains over time, SERP volatility metrics

**Use Cases:**
- Analyze Google algorithm update impacts
- Track seasonal ranking fluctuations
- Measure SERP volatility and stability
- Understand long-term ranking trends
- Identify ranking patterns and opportunities

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
│       ├── index.ts             # Tools aggregator
│       ├── schemas.ts           # Zod schemas
│       ├── keywords.ts          # Keyword tools (2 tools)
│       ├── google-trends.ts     # Google Trends & Difficulty (2 tools)
│       ├── domain-analysis.ts   # Domain Analysis (3 tools)
│       ├── keyword-suggestions.ts # Keyword Suggestions (2 tools)
│       ├── serp.ts              # SERP tools (3 tools)
│       └── backlinks.ts         # Backlink tools (3 tools)
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
