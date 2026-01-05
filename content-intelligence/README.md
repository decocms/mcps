# Content Intelligence MCP

**Domain service for aggregating, normalizing, and semantically enriching content.**

Content Intelligence MCP is a reusable intelligence layer that aggregates content from multiple external sources (RSS, Reddit, web scraping), normalizes data into a common model, and enriches it with LLM-based classification.

## 🎯 Purpose

This MCP serves as a **domain service** consumed by:

- 🤖 **AI Agents** - Via MCP protocol
- 🔗 **Other MCPs** - As a service dependency
- 💻 **Web Applications** - Via REST API (future)
- 🛠️ **Copilots** - Integration with development tools

> **Note:** This is NOT a frontend. It's a domain API without UI logic.

## 📐 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Content Intelligence MCP                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │   RSS    │  │  Reddit  │  │   Web    │  │ LinkedIn │        │
│  │Connector │  │Connector │  │ Scraper  │  │ (future) │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       │             │             │              │               │
│       └─────────────┴──────┬──────┴──────────────┘               │
│                            │                                      │
│                    ┌───────▼───────┐                             │
│                    │   Ingestion   │                             │
│                    │   Pipeline    │                             │
│                    └───────┬───────┘                             │
│                            │                                      │
│              ┌─────────────┼─────────────┐                       │
│              │             │             │                        │
│       ┌──────▼──────┐ ┌────▼────┐ ┌─────▼─────┐                  │
│       │ Normalizer  │ │Enricher │ │Deduplicator│                 │
│       └──────┬──────┘ └────┬────┘ └─────┬─────┘                  │
│              │             │            │                         │
│              └─────────────┴────────────┘                         │
│                            │                                      │
│                    ┌───────▼───────┐                             │
│                    │    Storage    │                             │
│                    │   (KV/D1)     │                             │
│                    └───────┬───────┘                             │
│                            │                                      │
│       ┌────────────────────┼────────────────────┐                │
│       │                    │                    │                 │
│  ┌────▼────┐        ┌──────▼──────┐      ┌─────▼─────┐          │
│  │ search  │        │weekly_digest│      │  trends   │           │
│  │_content │        │             │      │           │           │
│  └─────────┘        └─────────────┘      └───────────┘           │
│                                                                   │
│                        MCP Tools                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 🔧 Configuration Pattern

This MCP follows the **StateSchema configuration pattern** (like `readonly-sql`), not Deco bindings.

**Why?** Because we connect to **external APIs** (RSS feeds, Reddit API, websites), not other MCPs in the Deco ecosystem.

```typescript
// User provides configuration at installation time
export const StateSchema = BaseStateSchema.extend({
  sources: z.array(SourceSchema),        // Content sources to aggregate
  openaiApiKey: z.string().optional(),   // For LLM enrichment
  redditClientId: z.string().optional(), // For higher rate limits
  // ...
});

// Tools access config via state (same as readonly-sql)
const state = env.DECO_CHAT_REQUEST_CONTEXT.state;
const sources = state.sources;
```

## 🛠️ MCP Tools

### `SEARCH_CONTENT`

Search and filter aggregated content from all configured sources.

```typescript
// Input
{
  query?: string;           // Free text search query
  categories?: string[];    // Filter by categories
  sourceTypes?: string[];   // Filter by source type (rss, reddit, web_scraper)
  tags?: string[];          // Filter by tags
  minRelevanceScore?: number; // Minimum score (0-1)
  daysBack?: number;        // Days to search (default: 7)
  limit?: number;           // Max results (default: 20)
  excludeDuplicates?: boolean; // Exclude duplicates (default: true)
}

// Output
{
  results: ContentItem[];   // Found items
  total: number;            // Total results
  query?: string;           // Query used
}
```

### `GET_WEEKLY_DIGEST`

Retrieve the weekly content digest with executive summaries and trend analysis.

```typescript
// Input
{
  weekOffset?: number;       // Weeks in the past (0 = current)
  includeFullContent?: boolean; // Include full content
}

// Output
{
  digest: WeeklyDigest | null;
  message?: string;
}
```

### `GET_TRENDS`

Analyze content to identify emerging trends.

```typescript
// Input
{
  daysBack?: number;         // Days to analyze (default: 7)
  categories?: string[];     // Filter by categories
  limit?: number;            // Max trends (default: 10)
}

// Output
{
  trends: TrendItem[];
  periodStart: string;
  periodEnd: string;
  totalContentAnalyzed: number;
}
```

## 📦 Domain Models

### ContentItem

Normalized content item from any source.

```typescript
interface ContentItem {
  id: string;                    // Unique ID (ci_xxx)
  sourceId: string;              // Source reference
  sourceType: SourceType;        // rss | reddit | web_scraper
  title: string;
  content: string;
  summary?: string;              // LLM-generated
  url: string;
  author?: string;
  publishedAt?: string;          // ISO 8601
  fetchedAt: string;
  status: ProcessingStatus;      // raw | normalized | enriched | failed
  categories?: ContentCategory[];
  relevanceScore?: number;       // 0-1
  tags?: string[];
  semanticHash?: string;         // For deduplication
  duplicateOf?: string[];
  sourceMetadata?: Record<string, unknown>;
}
```

### Source

Content source configuration.

```typescript
interface Source {
  id: string;
  name: string;
  type: SourceType;
  config: SourceConfig;          // Type-specific config
  enabled: boolean;
  lastFetch?: {
    timestamp: string;
    itemCount: number;
    success: boolean;
    error?: string;
  };
  createdAt: string;
  updatedAt: string;
}
```

### WeeklyDigest

Aggregated weekly summary.

```typescript
interface WeeklyDigest {
  id: string;
  title: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  executiveSummary: string;      // LLM-generated
  sections: DigestSection[];     // By category
  topContentIds: string[];
  trends: TrendItem[];
  stats: {
    totalItems: number;
    itemsBySource: Record<string, number>;
    itemsByCategory: Record<string, number>;
    averageRelevanceScore: number;
  };
}
```

## 🔌 Connectors

Connectors are internal clients for fetching from external APIs. They are NOT Deco bindings.

### RSS Connector

Supports RSS 2.0 and Atom feeds.

```typescript
// Configured via StateSchema
{
  type: "rss",
  name: "TechCrunch",
  feedUrl: "https://techcrunch.com/feed/",
  enabled: true
}
```

### Reddit Connector

Fetches posts from subreddits via public API.

```typescript
{
  type: "reddit",
  name: "r/MachineLearning",
  subreddit: "MachineLearning",
  sortBy: "hot",
  minUpvotes: 100,
  enabled: true
}
```

### Web Scraper Connector

Extracts content using CSS selectors.

```typescript
{
  type: "web_scraper",
  name: "Hacker News",
  baseUrl: "https://news.ycombinator.com",
  selectors: {
    title: ".titleline > a",
    content: ".titleline > a",
    link: ".titleline > a"
  },
  enabled: true
}
```

## 🚀 Development

### Setup

```bash
cd content-intelligence
bun install
```

### Local Development

```bash
bun run dev
```

### Deploy

```bash
bun run deploy
```

### Type Check

```bash
bun run check
```

## 📁 Project Structure

```
content-intelligence/
├── server/
│   ├── main.ts              # Entry point and StateSchema
│   ├── domain/
│   │   ├── types.ts         # Domain types
│   │   ├── schemas.ts       # Zod schemas for validation
│   │   └── index.ts         # Module exports
│   ├── connectors/
│   │   ├── base.ts          # Connector interface
│   │   ├── rss.ts           # RSS connector
│   │   ├── reddit.ts        # Reddit connector
│   │   ├── web-scraper.ts   # Web scraping connector
│   │   └── index.ts         # Connector registry
│   └── tools/
│       ├── search-content.ts
│       ├── get-weekly-digest.ts
│       ├── get-trends.ts
│       └── index.ts
├── shared/
│   └── deco.gen.ts          # Generated types
├── package.json
├── tsconfig.json
├── vite.config.ts
└── wrangler.toml
```

## 🗺️ Roadmap

### MVP (v1.0)

- [x] Domain models defined
- [x] MCP tool contracts defined
- [x] Connector structure
- [ ] Implement RSS connector
- [ ] Implement Reddit connector
- [ ] Implement storage (Cloudflare KV)
- [ ] Basic normalization pipeline
- [ ] Weekly digest job

### v1.1

- [ ] LLM enrichment (OpenAI)
- [ ] Automatic category classification
- [ ] Relevance scoring
- [ ] Semantic deduplication

### v1.2

- [ ] Complete web scraper
- [ ] Trend analysis
- [ ] REST API for frontends
- [ ] Metrics dashboard

### Future

- [ ] LinkedIn connector
- [ ] Twitter/X connector
- [ ] Per-user personalization
- [ ] Webhooks for new content

## 🔧 Configuration

### State Variables

| Field | Type | Description |
|-------|------|-------------|
| `sources` | Source[] | Content sources to aggregate |
| `openaiApiKey` | string? | OpenAI API key for enrichment |
| `redditClientId` | string? | Reddit OAuth client ID |
| `redditClientSecret` | string? | Reddit OAuth client secret |
| `defaultRelevanceThreshold` | number | Default minimum score (0-1) |
| `categoriesOfInterest` | string[] | Categories for relevance scoring |

## 📖 Versioning

This MCP follows semantic versioning for tools and contracts:

- **Major**: Breaking changes in tool contracts
- **Minor**: New tools or optional fields
- **Patch**: Bug fixes and internal improvements

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Implement with tests
4. Open a PR describing changes

## 📄 License

MIT
