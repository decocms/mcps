# Gmail MCP

MCP Server for Gmail API integration. Read, send, search, and manage emails using the Gmail API with OAuth authentication.

## Features

### Message Management
- **list_messages** - List messages with filters and pagination
- **get_message** - Get full message details (headers, body, attachments)
- **send_message** - Send new emails with HTML support
- **search_messages** - Search using Gmail query syntax
- **trash_message** - Move message to trash
- **untrash_message** - Restore message from trash
- **delete_message** - Permanently delete a message
- **modify_message** - Add/remove labels (mark as read, star, etc.)

### Thread Management
- **list_threads** - List email conversations
- **get_thread** - Get entire conversation with all messages
- **trash_thread** - Move entire conversation to trash
- **untrash_thread** - Restore conversation from trash
- **modify_thread** - Add/remove labels from entire conversation
- **delete_thread** - Permanently delete entire conversation

### Label Management
- **list_labels** - List all labels (system + custom)
- **get_label** - Get label details and counts
- **create_label** - Create custom label with colors
- **update_label** - Update label name, color, visibility
- **delete_label** - Delete custom label

### Draft Management
- **list_drafts** - List saved drafts
- **get_draft** - Get draft content
- **create_draft** - Create new draft
- **update_draft** - Update existing draft
- **send_draft** - Send a saved draft
- **delete_draft** - Delete a draft

## Setup

### 1. Create Project in Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable **Gmail API**:
   - Sidebar → APIs & Services → Library
   - Search for "Gmail API" and enable it

### 2. Configure OAuth 2.0

1. Go to "APIs & Services" → "Credentials"
2. Click "Create credentials" → "OAuth client ID"
3. Select "Web application"
4. Configure:
   - Name: Gmail MCP
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

### List unread messages

```json
{
  "tool": "list_messages",
  "input": {
    "q": "is:unread",
    "labelIds": ["INBOX"],
    "maxResults": 10
  }
}
```

### Get message details

```json
{
  "tool": "get_message",
  "input": {
    "id": "18abc123def",
    "format": "full"
  }
}
```

### Send an email

```json
{
  "tool": "send_message",
  "input": {
    "to": "recipient@example.com",
    "subject": "Hello from Gmail MCP",
    "body": "<h1>Hello!</h1><p>This is a test email.</p>",
    "cc": "copy@example.com"
  }
}
```

### Search with Gmail query

```json
{
  "tool": "search_messages",
  "input": {
    "query": "from:john@example.com subject:meeting after:2024/01/01",
    "maxResults": 20
  }
}
```

### Mark message as read

```json
{
  "tool": "modify_message",
  "input": {
    "id": "18abc123def",
    "removeLabelIds": ["UNREAD"]
  }
}
```

### Archive a message (remove from inbox)

```json
{
  "tool": "modify_message",
  "input": {
    "id": "18abc123def",
    "removeLabelIds": ["INBOX"]
  }
}
```

### Star a message

```json
{
  "tool": "modify_message",
  "input": {
    "id": "18abc123def",
    "addLabelIds": ["STARRED"]
  }
}
```

### Create a custom label

```json
{
  "tool": "create_label",
  "input": {
    "name": "Work/Projects",
    "backgroundColor": "#4285f4",
    "textColor": "#ffffff"
  }
}
```

### Create and send a draft

```json
{
  "tool": "create_draft",
  "input": {
    "to": "client@example.com",
    "subject": "Proposal",
    "body": "Please find attached our proposal..."
  }
}
```

Then send it:

```json
{
  "tool": "send_draft",
  "input": {
    "id": "r-1234567890"
  }
}
```

## Gmail Search Query Syntax

The `q` parameter in search supports Gmail's powerful query syntax:

| Query | Description |
|-------|-------------|
| `is:unread` | Unread messages |
| `is:read` | Read messages |
| `is:starred` | Starred messages |
| `is:important` | Important messages |
| `from:user@email.com` | From specific sender |
| `to:user@email.com` | To specific recipient |
| `subject:keyword` | Subject contains keyword |
| `has:attachment` | Has attachments |
| `filename:pdf` | Has PDF attachments |
| `after:2024/01/01` | After date |
| `before:2024/12/31` | Before date |
| `older_than:7d` | Older than 7 days |
| `newer_than:2d` | Newer than 2 days |
| `label:work` | Has label 'work' |
| `in:inbox` | In inbox |
| `in:sent` | In sent folder |
| `in:trash` | In trash |

Combine queries: `from:john subject:meeting is:unread`

## Project Structure

```
gmail/
├── server/
│   ├── main.ts              # Entry point with OAuth
│   ├── constants.ts         # API URLs and constants
│   ├── lib/
│   │   ├── gmail-client.ts  # API client
│   │   ├── types.ts         # TypeScript types
│   │   └── env.ts           # Access token helper
│   └── tools/
│       ├── index.ts         # Exports all tools
│       ├── messages.ts      # Message tools
│       ├── threads.ts       # Thread tools
│       ├── labels.ts        # Label tools
│       └── drafts.ts        # Draft tools
├── shared/
│   └── deco.gen.ts          # Generated types
├── app.json                 # MCP configuration
├── package.json
├── tsconfig.json
└── README.md
```

## OAuth Scopes

This MCP requests the following scopes:

- `https://www.googleapis.com/auth/gmail.readonly` - Read messages and settings
- `https://www.googleapis.com/auth/gmail.send` - Send messages
- `https://www.googleapis.com/auth/gmail.modify` - Modify messages and labels
- `https://www.googleapis.com/auth/gmail.labels` - Manage labels

## System Labels

Common system labels you can use:

| Label | Description |
|-------|-------------|
| `INBOX` | Inbox |
| `SENT` | Sent messages |
| `DRAFT` | Drafts |
| `SPAM` | Spam |
| `TRASH` | Trash |
| `UNREAD` | Unread messages |
| `STARRED` | Starred |
| `IMPORTANT` | Important |
| `CATEGORY_PERSONAL` | Personal category |
| `CATEGORY_SOCIAL` | Social category |
| `CATEGORY_PROMOTIONS` | Promotions category |
| `CATEGORY_UPDATES` | Updates category |

## License

MIT

