# Bookmarks MCP

Bookmark management with AI enrichment via Perplexity and Firecrawl.

## Overview

The Bookmarks MCP provides tools for managing bookmarks stored in Supabase with AI-powered enrichment capabilities.

## Features

- **CRUD Operations** - Create, read, update, delete bookmarks
- **Full-Text Search** - Search across titles, descriptions, and content
- **AI Research** - Use Perplexity to research bookmark content
- **Web Scraping** - Use Firecrawl to extract page content
- **Auto-Classification** - Generate tags and insights automatically
- **Browser Import** - Import from Chrome or Firefox exports

## Bookmark Schema

Each bookmark includes:

| Field | Description |
|-------|-------------|
| `url` | Bookmark URL (unique) |
| `title` | Page title |
| `description` | Brief description |
| `stars` | Rating (0-5) |
| `tags` | Array of tags |
| `perplexity_research` | AI-generated research summary |
| `firecrawl_content` | Scraped page content |
| `insight_dev` | Insight for developers |
| `insight_founder` | Insight for founders |
| `insight_investor` | Insight for investors |
| `reading_time_min` | Estimated reading time |
| `language` | Content language |

## Tools

### CRUD

| Tool | Description |
|------|-------------|
| `BOOKMARK_LIST` | List bookmarks with filters |
| `BOOKMARK_GET` | Get single bookmark by URL or ID |
| `BOOKMARK_CREATE` | Create new bookmark |
| `BOOKMARK_UPDATE` | Update bookmark |
| `BOOKMARK_DELETE` | Delete bookmark |
| `BOOKMARK_SEARCH` | Full-text search |

### Enrichment

| Tool | Description |
|------|-------------|
| `BOOKMARK_RESEARCH` | Research URL with Perplexity |
| `BOOKMARK_SCRAPE` | Scrape content with Firecrawl |
| `BOOKMARK_CLASSIFY` | Auto-classify with tags and insights |
| `BOOKMARK_ENRICH_BATCH` | Batch enrich multiple bookmarks |

### Import

| Tool | Description |
|------|-------------|
| `BOOKMARK_IMPORT_CHROME` | Import from Chrome HTML export |
| `BOOKMARK_IMPORT_FIREFOX` | Import from Firefox export |

## Prompts

| Prompt | Description |
|--------|-------------|
| `SETUP_TABLES` | SQL to create bookmarks tables in Supabase |
| `ENRICH_WORKFLOW` | Workflow for bulk enriching bookmarks |

## Bindings

| Binding | Required | Description |
|---------|----------|-------------|
| `SUPABASE` | Yes | Supabase for bookmark storage |
| `PERPLEXITY` | Optional | AI research capabilities |
| `FIRECRAWL` | Optional | Web scraping capabilities |

## Quick Start

1. **Setup database**: Run `SETUP_TABLES` prompt in Supabase
2. **Create bookmarks**: Use `BOOKMARK_CREATE` or import from browser
3. **Enrich**: Use `BOOKMARK_ENRICH_BATCH` to add AI research

## Development

```bash
# Install dependencies
bun install

# Run locally
bun run dev

# Type check
bun run check

# Build for production
bun run build
```

## License

MIT
