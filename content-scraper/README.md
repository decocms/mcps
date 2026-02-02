# Content Scraper MCP

MCP for listing and querying scraped content from multiple sources stored in a database.

## Features

- **Multiple Sources**: Query content from different origins (web, Reddit, LinkedIn, Twitter)
- **Pagination**: Support for pagination by index range
- **Week Filter**: Option to filter only this week's content
- **Flexible Query**: Search in a specific table or all at once
- **Skills**: Documentation for LLMs to learn how to interact with the system

## Configuration

### 1. Database

The MCP expects a database with the following tables:

- `contents` - General web content
- `reddit_content_scrape` - Reddit scraped content
- `linkedin_content_scrape` - LinkedIn scraped content
- `twitter_content_scrape` - Twitter scraped content
- `deco_weekly_report` - Weekly digest reports

### 2. Install the MCP

When installing, configure:
- `database.apiUrl`: Database API URL
- `database.token`: Authentication token

## Available Tools

### `LIST_SCRAPED_CONTENT`

Lists content already scraped and saved in the database.

**Input:**
```json
{
  "table": "all",
  "startIndex": 1,
  "endIndex": 100,
  "onlyThisWeek": false
}
```

**Parameters:**
- `table`: Which source to query - `"all"`, `"contents"`, `"reddit"`, `"linkedin"`, or `"twitter"`
- `startIndex`: Start index (default: 1)
- `endIndex`: End index (default: 100)
- `onlyThisWeek`: If `true`, returns only this week's content

**Output:**
```json
{
  "success": true,
  "results": [
    {
      "table": "contents",
      "data": [...],
      "count": 50
    },
    {
      "table": "reddit",
      "data": [...],
      "count": 30
    }
  ],
  "totalCount": 80,
  "range": {
    "startIndex": 1,
    "endIndex": 100
  }
}
```

### `GET_WEEKLY_REPORT_PUBLISHING_SKILL`

Returns the Weekly Report Publishing skill documentation. This skill teaches how to publish weekly digest reports to the `deco_weekly_report` database table.

**Input:**
```json
{}
```

**Output:**
```json
{
  "success": true,
  "skill": "# Weekly Report Publishing Skill...",
  "skill_name": "Weekly Report Publishing",
  "summary": "This skill teaches how to publish Weekly Digest reports..."
}
```

### `LIST_AVAILABLE_SKILLS`

Lists all available skills/documentation that can be retrieved.

**Input:**
```json
{}
```

**Output:**
```json
{
  "success": true,
  "skills": [
    {
      "id": "weekly-report-publishing",
      "name": "Weekly Report Publishing",
      "description": "Teaches how to publish weekly digest reports...",
      "tool_to_access": "GET_WEEKLY_REPORT_PUBLISHING_SKILL"
    }
  ]
}
```

## Skills

The MCP includes skills (documentation for LLMs) that teach how to interact with the system:

### Weekly Report Publishing

**Path:** `skills/weekly-report-publishing/SKILL.md`

**Tool:** `GET_WEEKLY_REPORT_PUBLISHING_SKILL`

Skill that teaches an LLM how to publish Weekly Reports to the `deco_weekly_report` table. Includes:

- Complete table schema
- INSERT, UPDATE, and SELECT examples
- URL and slug patterns
- Special character handling
- Publishing checklist

## Development

```bash
cd content-scraper
bun install
bun run dev     # Local development
bun run deploy  # Deploy to production
```

## Architecture

```
content-scraper/
├── server/
│   ├── main.ts              # Entry point and StateSchema
│   ├── lib/
│   │   └── db-client.ts     # Database client
│   ├── tools/
│   │   ├── index.ts         # Exports all tools
│   │   ├── content-scrape.ts # Content listing tool
│   │   └── skills.ts        # Skills tools
│   └── types/
│       └── env.ts           # Environment types
├── skills/
│   └── weekly-report-publishing/
│       └── SKILL.md         # Weekly Report publishing skill
├── package.json
└── tsconfig.json
```
