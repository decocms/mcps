# Google Calendar MCP

MCP Server for Google Calendar integration. Manage calendars, events and check availability using the Google Calendar API.

## Features

### Calendar Management
- **list_calendars** - List all user's calendars
- **get_calendar** - Get details of a specific calendar
- **create_calendar** - Create a new secondary calendar
- **delete_calendar** - Delete a calendar

### Event Management
- **list_events** - List events with date filters and search
- **get_event** - Get details of an event
- **create_event** - Create event with attendees and reminders
- **update_event** - Update existing event
- **delete_event** - Delete event
- **quick_add_event** - Create event using natural language

### Availability
- **get_freebusy** - Check busy/free time slots

### Advanced Operations
- **move_event** - Move an event between calendars
- **find_available_slots** - Find free time slots across multiple calendars
- **duplicate_event** - Create a copy of an existing event

## Setup

### 1. Create Project in Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable **Google Calendar API**:
   - Sidebar → APIs & Services → Library
   - Search for "Google Calendar API" and enable it

### 2. Configure OAuth 2.0

1. Go to "APIs & Services" → "Credentials"
2. Click "Create credentials" → "OAuth client ID"
3. Select "Web application"
4. Configure:
   - Name: Google Calendar MCP
   - Authorized JavaScript origins: your URL
   - Authorized redirect URIs: your callback URL

### 3. Configure Environment Variables

Create a `.env` file with:

```bash
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
```

## Development

```bash
# Install dependencies (from monorepo root)
bun install

# Run in development (hot reload)
bun run dev

# Type check
bun run check

# Build for production
bun run build
```

## Usage Examples

### List events for next week

```json
{
  "tool": "list_events",
  "input": {
    "timeMin": "2024-01-15T00:00:00Z",
    "timeMax": "2024-01-22T00:00:00Z",
    "singleEvents": true,
    "orderBy": "startTime"
  }
}
```

### Create event with attendees

```json
{
  "tool": "create_event",
  "input": {
    "summary": "Planning Meeting",
    "description": "Q1 roadmap discussion",
    "location": "Conference Room",
    "start": {
      "dateTime": "2024-01-15T14:00:00-03:00",
      "timeZone": "America/Sao_Paulo"
    },
    "end": {
      "dateTime": "2024-01-15T15:00:00-03:00",
      "timeZone": "America/Sao_Paulo"
    },
    "attendees": [
      { "email": "john@company.com" },
      { "email": "mary@company.com" }
    ],
    "sendUpdates": "all"
  }
}
```

### Quick add event with natural language

```json
{
  "tool": "quick_add_event",
  "input": {
    "text": "Lunch with client tomorrow at 12pm at Central Restaurant"
  }
}
```

### Check availability

```json
{
  "tool": "get_freebusy",
  "input": {
    "timeMin": "2024-01-15T08:00:00-03:00",
    "timeMax": "2024-01-15T18:00:00-03:00",
    "calendarIds": ["primary", "work@group.calendar.google.com"]
  }
}
```

### Find available meeting slots

```json
{
  "tool": "find_available_slots",
  "input": {
    "calendarIds": ["primary", "colleague@company.com"],
    "timeMin": "2024-01-15T09:00:00-03:00",
    "timeMax": "2024-01-15T18:00:00-03:00",
    "slotDurationMinutes": 30,
    "maxSlots": 5
  }
}
```

### Move event to another calendar

```json
{
  "tool": "move_event",
  "input": {
    "sourceCalendarId": "primary",
    "eventId": "abc123",
    "destinationCalendarId": "work@group.calendar.google.com",
    "sendUpdates": "all"
  }
}
```

### Duplicate an event

```json
{
  "tool": "duplicate_event",
  "input": {
    "eventId": "abc123",
    "newStart": {
      "dateTime": "2024-01-22T14:00:00-03:00",
      "timeZone": "America/Sao_Paulo"
    },
    "newEnd": {
      "dateTime": "2024-01-22T15:00:00-03:00",
      "timeZone": "America/Sao_Paulo"
    }
  }
}
```

## Project Structure

```
google-calendar/
├── server/
│   ├── main.ts              # Entry point with OAuth
│   ├── constants.ts         # API URLs and constants
│   ├── lib/
│   │   ├── google-client.ts # API client
│   │   └── types.ts         # TypeScript types
│   └── tools/
│       ├── index.ts         # Exports all tools
│       ├── calendars.ts     # Calendar tools
│       ├── events.ts        # Event tools
│       ├── freebusy.ts      # Availability tool
│       └── advanced.ts      # Advanced tools (move, find slots, duplicate)
├── app.json                 # MCP configuration
├── package.json
├── tsconfig.json
└── README.md
```

## OAuth Scopes

This MCP requests the following scopes:

- `https://www.googleapis.com/auth/calendar` - Full calendar access
- `https://www.googleapis.com/auth/calendar.events` - Event management

## License

MIT
