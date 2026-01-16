# Grain MCP 

Access and manage your Grain meeting recordings through the Model Context Protocol.

## Overview

The Grain MCP provides seamless integration with [Grain](https://grain.com), allowing AI assistants and applications to access your meeting recordings, transcripts, and summaries. Grain automatically records, transcribes, and summarizes your meetings, and this MCP makes that data accessible through a standardized interface.

## Features

- 📝 **List Recordings**: Browse all your meeting recordings with powerful filtering options
- 🔍 **Search**: Find specific meetings by keywords, dates, or participants
- 📊 **Rich Metadata**: Access titles, dates, durations, participants, and summaries
- 🎯 **Filter by Status**: View only ready recordings or check processing status
- 📅 **Date Range Filtering**: Find meetings within specific time periods
- 🔔 **Real-time Webhooks**: Receive automatic notifications when recordings are created, updated, or processed
- 💾 **Local Database Search**: Search through indexed recordings stored locally via webhooks

## Authentication

This MCP uses API Key authentication. To get your Grain API key:

1. Go to [Grain Settings - API](https://grain.com/settings/api)
2. Click "Generate API Key"
3. Copy the generated API key
4. Provide it when connecting to this MCP

**Note**: Keep your API key secure and don't share it with others.

## Tools

### 1. LIST_RECORDINGS

List and search through your Grain meeting recordings with flexible filtering options.

**Input Parameters:**
- `limit` (optional): Maximum number of recordings to return (1-100, default: 50)
- `offset` (optional): Number of recordings to skip for pagination (default: 0)
- `start_date` (optional): Filter recordings from this date onwards (ISO 8601 format)
- `end_date` (optional): Filter recordings up to this date (ISO 8601 format)
- `status` (optional): Filter by status: "processing", "ready", or "failed"
- `search` (optional): Search by title, transcript, or participant names

**Output:**
- `recordings`: Array of recording objects with details
- `total`: Total number of recordings matching the query
- `limit`: Results per page
- `offset`: Current pagination offset
- `has_more`: Whether more results are available

**Example Usage:**

```typescript
// List recent recordings
{
  "limit": 10,
  "status": "ready"
}

// Search for specific meetings
{
  "search": "product roadmap",
  "start_date": "2024-01-01"
}

// Get recordings from a date range
{
  "start_date": "2024-01-01",
  "end_date": "2024-01-31",
  "limit": 20
}
```

### 2. GET_RECORDING

Get detailed information about a specific Grain recording by its ID. Returns comprehensive details including full transcript, AI summary, highlights, and more.

### 3. SEARCH_INDEXED_RECORDINGS

Search through recordings that have been indexed in the local PostgreSQL database via webhooks. This provides faster search across recordings that have been automatically indexed when Grain sends webhook notifications.

**Input Parameters:**
- `query` (optional): Search query to find recordings by title (uses full-text search)
- `start_date` (optional): Filter recordings from this date onwards (ISO 8601 format)
- `end_date` (optional): Filter recordings up to this date (ISO 8601 format)
- `limit` (optional): Maximum number of recordings to return (1-100, default: 10)

**Output:**
- `recordings`: Array of indexed recording objects
- `count`: Number of recordings returned

**Example Usage:**

```typescript
// Search by title
{
  "query": "product roadmap"
}

// Search by date range
{
  "start_date": "2024-01-01",
  "end_date": "2024-01-31",
  "limit": 20
}
```

**Note:** Only recordings received via webhooks are available in this search. Use `LIST_RECORDINGS` to search all recordings directly from the Grain API.

**Input Parameters:**
- `recordingId` (required): The unique identifier of the recording (e.g., "rec_abc123")

**Output:**
Returns a detailed recording object with all available information including:
- Basic info (id, title, date, duration, status)
- Participants with roles and emails
- Full transcript text
- Timestamped transcript segments with speaker attribution
- AI-generated summary
- User-created highlights and bookmarks
- Tags and metadata
- URLs to view in Grain

**Example Usage:**

```typescript
// Get details of a specific recording
{
  "recordingId": "rec_abc123"
}
```

## Recording Object Structure

Each recording object includes:

```typescript
{
  id: string;              // Unique identifier
  title: string;           // Meeting title
  date: string;            // Recording date (ISO 8601)
  duration: number;        // Duration in seconds
  status: string;          // "processing" | "ready" | "failed"
  participants?: Array<{   // Meeting participants
    id: string;
    name: string;
    email?: string;
    role?: string;
  }>;
  summary?: string;        // AI-generated summary
  meeting_url?: string;    // URL to view in Grain
  recording_url?: string;  // Direct recording URL
  created_at: string;      // Creation timestamp
  updated_at: string;      // Last update timestamp
}
```

## Webhooks

This MCP automatically sets up webhooks with Grain to receive real-time notifications about your recordings. When you install or configure this MCP, it will:

1. **Automatically create webhooks** pointing to the Deco Mesh
2. **Listen for events** such as:
   - `recording.created` - When a new recording starts
   - `recording.updated` - When recording metadata changes
   - `recording.processed` - When transcription and AI processing completes

3. **Process events** through the `eventHandler` where you can add custom logic

### How Webhooks Work

```
Grain Event → Grain API → Mesh → Your MCP → Custom Logic
```

The webhook URL is automatically constructed as:
```
${meshUrl}/events/grain_recording?sub=${connectionId}
```

This ensures events are routed to your specific MCP instance.

## Use Cases

### Meeting Analytics
Analyze your meeting patterns, participant engagement, and time distribution across different types of meetings.

### Knowledge Base Search
Search through all your meeting transcripts to find when specific topics were discussed or decisions were made.

### Automated Summaries
Access AI-generated summaries of your meetings to quickly review what was discussed without watching the entire recording.

### Follow-up Automation
Identify meetings that require follow-up based on participants, topics, or action items mentioned.

### Team Insights
Track team collaboration by analyzing who attends which meetings and how often different people interact.

### Real-time Notifications
Get instant alerts when new recordings are ready, enabling immediate action on important meetings.

## API Reference

The Grain API uses the following structure:
- **Base URL**: `https://api.grain.com`
- **List Recordings**: `GET /_/public-api/recordings` (note: one underscore, not two)
- **Get Recording**: `GET /_/public-api/recordings/{id}`
- **Authentication**: Bearer token in Authorization header

For detailed information about the Grain API, visit:
- [Grain Developer Documentation](https://developers.grain.com/)
- [API Reference](https://developers.grain.com/api-reference)

## Support

For issues or questions:
- Grain Support: [support@grain.com](mailto:support@grain.com)
- Grain Documentation: [https://help.grain.com](https://help.grain.com)

## Development

### Setup

```bash
# Install dependencies
bun install

# Run in development mode
bun run dev

# Type check
bun run check

# Build for production
bun run build
```

### Project Structure

```
grain/
├── server/
│   ├── main.ts           # MCP server entry point
│   ├── constants.ts      # API constants
│   ├── lib/
│   │   ├── grain-client.ts   # Grain API client with error handling
│   │   ├── types.ts          # TypeScript types
│   │   ├── postgres.ts       # PostgreSQL database operations
│   │   └── env.ts            # Environment helpers
│   ├── tools/
│   │   ├── index.ts                    # Tools export
│   │   ├── list-recordings.ts          # List recordings from Grain API
│   │   ├── get-recording.ts            # Get recording details
│   │   └── search-indexed-recordings.ts # Search local database
│   └── types/
│       └── env.ts            # Environment type definitions
├── package.json
├── tsconfig.json
├── app.json
└── README.md
```

## License

This MCP is part of the Deco MCP collection and follows the same licensing terms.

## Contributing

Contributions are welcome! Please ensure your code follows the existing patterns and includes appropriate tests.

