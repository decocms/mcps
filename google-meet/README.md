# Google Meet MCP
 
MCP Server for Google Meet API. Create and manage video meetings.

## Features

### Meeting Spaces
- **create_meeting** - Create a new meeting space
- **get_meeting** - Get meeting details
- **update_meeting** - Update meeting settings
- **end_meeting** - End active conference

### Conference Records
- **list_conference_records** - List past meetings
- **get_conference_record** - Get conference details
- **list_participants** - List meeting participants
- **get_participant_sessions** - Get participant join/leave times

### Recordings & Transcripts
- **list_recordings** - List meeting recordings
- **get_recording** - Get recording details
- **list_transcripts** - List meeting transcripts
- **list_transcript_entries** - Get transcript text

## Setup

### 1. Enable Google Meet API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable **Google Meet API**
3. Configure OAuth 2.0 credentials

### 2. Environment Variables

```bash
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
```

## Usage Examples

### Create a meeting

```json
{
  "tool": "create_meeting",
  "input": {
    "accessType": "OPEN"
  }
}
```

Returns a meeting link like `https://meet.google.com/abc-defg-hij`

### Get meeting participants

```json
{
  "tool": "list_participants",
  "input": {
    "conferenceRecord": "conferenceRecords/abc123"
  }
}
```

### Get meeting transcript

```json
{
  "tool": "list_transcript_entries",
  "input": {
    "transcriptName": "conferenceRecords/abc123/transcripts/xyz789"
  }
}
```

## Access Types

| Type | Description |
|------|-------------|
| `OPEN` | Anyone with the link can join |
| `TRUSTED` | Only users in your organization |
| `RESTRICTED` | Only invited users |

## License

MIT

