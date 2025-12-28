# Grain MCP

A Model Context Protocol (MCP) server for [Grain](https://grain.com), the AI-powered meeting recorder and note-taking tool that automatically joins your calls, records, transcribes, and creates intelligent notes.

## Overview

Grain is an AI meeting assistant used by 100K+ sales leaders and user researchers. It joins your Zoom, Google Meet, Microsoft Teams, or Webex calls to:

- 🎥 **Record meetings automatically**
- 📝 **Transcribe with AI** - Get accurate transcriptions with speaker identification
- 🤖 **Generate AI notes** - Customizable notes templates for different meeting types
- 🔍 **Search conversations** - Find what was said in any meeting
- ✂️ **Create highlights** - Mark and share important moments
- 🔗 **Integrate everywhere** - Send notes to Slack, HubSpot, Salesforce, and more

This MCP provides programmatic access to your Grain recordings and transcripts, making it easy to build AI agents that can access meeting data, search conversations, and extract insights.

## Features

### 🔧 **Tools**

#### Recording Access
- **`LIST_RECORDINGS`** - List your meeting recordings with powerful filters

## Installation

### Prerequisites

1. A Grain account ([sign up at grain.com](https://grain.com))
2. Grain API key (get from your Grain settings)
3. Node.js 22+ and Bun installed

### Setup

```bash
# Navigate to the grain directory
cd grain

# Install dependencies
bun install

# Configure your API key
echo "GRAIN_API_KEY=your_api_key_here" > .dev.vars

# Start development server
bun run dev
```

## Configuration

Set your Grain API key:

```bash
GRAIN_API_KEY=your_api_key_here
```

Optional configuration:
- `GRAIN_API_URL`: Override the default API base URL

## Usage Examples

### 1. List Recent Recordings

Find your recent meetings:

```typescript
// List last 10 recordings
const { recordings } = await LIST_RECORDINGS({
  limit: 10,
  sort_by: "recorded_at",
  sort_order: "desc"
});

recordings.forEach(rec => {
  console.log(`${rec.title} - ${rec.duration_seconds}s`);
  console.log(`Status: ${rec.status}`);
  console.log(`Transcript ready: ${rec.transcript_available}`);
});
```

### 2. Filter Sales Calls

Find specific types of meetings:

```typescript
// Get all sales calls from last week
const { recordings } = await LIST_RECORDINGS({
  meeting_type: "sales_call",
  from_date: "2025-12-20",
  to_date: "2025-12-27",
  meeting_platform: "zoom"
});

console.log(`Found ${recordings.length} sales calls`);
```

### 3. Find Meetings with Specific Participants

Track meetings with key people:

```typescript
// Find all meetings with a specific customer
const { recordings } = await LIST_RECORDINGS({
  participant_email: "customer@example.com",
  limit: 50
});
```


## Use Cases

### 🎯 Sales

```typescript
// Review yesterday's sales calls
const { recordings } = await LIST_RECORDINGS({
  meeting_type: "sales_call",
  from_date: "2025-12-27",
  limit: 20
});

console.log(`Found ${recordings.length} sales calls`);
recordings.forEach(rec => {
  console.log(`- ${rec.title} (${Math.floor(rec.duration_seconds / 60)}m)`);
  console.log(`  Participants: ${rec.participants_count}`);
});
```

### 🔬 User Research

```typescript
// Find all customer interviews
const { recordings } = await LIST_RECORDINGS({
  meeting_type: "customer_interview",
  tags: ["product_feedback"],
  limit: 50
});

console.log(`Found ${recordings.length} customer interviews`);
```

### 📊 Analytics

```typescript
// Analyze meeting durations
const { recordings } = await LIST_RECORDINGS({
  from_date: "2025-12-01",
  to_date: "2025-12-31",
  limit: 100
});

const avgDuration = recordings.reduce(
  (sum, r) => sum + r.duration_seconds, 0
) / recordings.length;

console.log(`Average meeting duration: ${Math.floor(avgDuration / 60)} minutes`);
console.log(`Total meetings: ${recordings.length}`);
```

## Architecture

```
grain/
├── server/
│   ├── main.ts                 # Entry point & runtime config
│   ├── constants.ts            # API endpoints & constants
│   ├── lib/
│   │   ├── client.ts           # Grain API client
│   │   ├── types.ts            # TypeScript types
│   │   └── env.ts              # Environment helpers
│   └── tools/
│       ├── index.ts            # Tool aggregator
│       └── recordings.ts       # Recording & transcript tools
├── app.json                    # Registry configuration
└── README.md
```

## API Reference

### LIST_RECORDINGS

Lists your Grain recordings with filters.

**Filters:**
- `meeting_type` - Filter by type (sales_call, customer_interview, etc)
- `meeting_platform` - Filter by platform (zoom, meet, teams, webex)
- `tags` - Filter by tags
- `participant_email` - Find meetings with specific people
- `from_date` / `to_date` - Date range (ISO format: YYYY-MM-DD)
- `status` - Filter by status (processing, ready, failed)
- `sort_by` - Sort field (recorded_at, created_at, duration, title)
- `sort_order` - Order (asc, desc)
- `limit` - Number of results (1-100, default: 20)
- `offset` - Pagination offset


## Development

```bash
# Install dependencies
bun install

# Start development server
bun run dev

# Build for production
bun run build

# Type checking
bun run check

# Publish to registry
bun run publish
```


## Limitations

- **Rate Limits**: Depend on your Grain plan
- **Basic Version**: Currently only supports listing recordings

## Support

- **Grain Documentation**: [grain.com/help](https://grain.com/help)
- **Grain Developers**: [developers.grain.com](https://developers.grain.com)
- **MCP Issues**: Report in the repository

## License

This MCP is part of the Deco MCP collection.

## Related

- [Grain](https://grain.com) - AI Meeting Recorder & Note-Taking
- [Grain Developer Docs](https://developers.grain.com)
- [Deco MCP Platform](https://deco.cx) - MCP hosting and management
- [Model Context Protocol](https://modelcontextprotocol.io) - MCP specification
