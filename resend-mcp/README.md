# Resend MCP

Send transactional and marketing emails via Resend API. Simple, reliable email delivery for your applications.

## Features

- 📧 Send HTML and plain text emails
- 👥 Support for multiple recipients (to/cc/bcc)
- 🔄 Custom headers and reply-to addresses
- ⚙️ Configurable default sender
- 🔒 Secure API key-based authentication

## Installation

### Prerequisites

- Bun runtime
- Resend API key (get it from https://resend.com/api-keys)

### Setup

1. Install dependencies:
```bash
bun install
```

2. Run the development server:
```bash
bun run dev
```

3. Build for production:
```bash
bun run build
```

## Configuration

When installing the MCP, you'll need to provide:

- **API Key** (required): Your Resend API key
- **Default From** (optional): Default sender email (e.g., 'Team <onboarding@resend.dev>')
- **Default From Name** (optional): Default sender name (used if defaultFrom is just an email)

## Tool: send_email

Send an email via Resend API with comprehensive options.

### Parameters

- `from` (optional): Sender email address. Falls back to configured default if not provided.
- `to` (required): Recipient email address(es). Can be a single email or array.
- `subject` (required): Email subject line
- `html` (optional): HTML content of the email
- `text` (optional): Plain text content of the email
- `bcc` (optional): Blind carbon copy recipient(s)
- `cc` (optional): Carbon copy recipient(s)
- `reply_to` (optional): Reply-to address(es)
- `headers` (optional): Custom email headers (key-value pairs)

**Note**: At least one of `html` or `text` must be provided.

### Response Format

```json
{
  "data": {
    "id": "email_id"
  },
  "error": null
}
```

Or in case of error:

```json
{
  "data": null,
  "error": {
    "name": "error_code",
    "message": "Error description"
  }
}
```

## Error Codes

- `missing_api_key` (401): API key not provided
- `invalid_api_key` (403): Invalid API key
- `validation_error` (422): Invalid request parameters
- `rate_limit_exceeded` (429): Too many requests
- `internal_server_error` (500): Server error
- `missing_required_field`: Required field missing (e.g., no 'from' address)

## Example Usage

### Simple Text Email

```json
{
  "to": "user@example.com",
  "subject": "Welcome!",
  "text": "Thanks for signing up!"
}
```

### HTML Email with CC

```json
{
  "from": "Team <team@company.com>",
  "to": "user@example.com",
  "cc": "manager@company.com",
  "subject": "Monthly Report",
  "html": "<h1>Report</h1><p>Your monthly report is ready.</p>"
}
```

### Multiple Recipients with Custom Headers

```json
{
  "to": ["user1@example.com", "user2@example.com"],
  "subject": "Team Update",
  "html": "<p>Important team update</p>",
  "headers": {
    "X-Priority": "1",
    "X-Custom-Header": "value"
  }
}
```

## Development

### Scripts

- `bun run dev` - Start development server with hot reload
- `bun run build` - Build for production
- `bun run check` - Run TypeScript type checking
- `bun run publish` - Publish to Deco registry

### Project Structure

```
resend-mcp/
├── server/
│   ├── main.ts           # Entry point
│   ├── lib/
│   │   ├── client.ts     # Resend API client
│   │   └── env.ts        # Environment helpers
│   └── tools/
│       ├── email.ts      # Email tool implementation
│       └── index.ts      # Tools export
├── shared/
│   └── deco.gen.ts       # Generated types and StateSchema
├── app.json              # MCP metadata
├── package.json          # Dependencies and scripts
└── tsconfig.json         # TypeScript configuration
```

## License

Private
