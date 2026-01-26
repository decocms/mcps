# Resend MCP Tool Specification

This document describes all functionality from the Resend app that should be implemented as MCP tools.

## Overview

Resend is an email platform API for sending transactional and marketing emails. This MCP implementation should provide tools to interact with the Resend API.

## Authentication & Configuration

### API Configuration
- **Base URL**: `https://api.resend.com`
- **Authentication**: Bearer token in Authorization header
  - Format: `Authorization: Bearer {API_KEY}`
- **Content-Type**: `application/json`

### Default Configuration (Optional)
These can be set as defaults but should be overridable per-tool invocation:
- **Default Sender Name**: e.g., "Contact"
- **Default Sender Email/Domain**: e.g., "onboarding@resend.dev"
- **Default Recipients**: Array of email addresses
- **Default Subject**: Default email subject line

## Tools

### Tool 1: Send Email

**Purpose**: Send an email via the Resend API

**API Endpoint**: `POST /emails`

**Input Parameters**:

All parameters are optional if defaults are configured, but at minimum `to`, `subject`, and either `html` or `text` should be provided:

- **from** (string, optional): Sender email address
  - Format: Can be just email or "Name <email@domain.com>"
  - Falls back to configured default sender if not provided

- **to** (string | string[], required): Recipient email address(es)
  - Can be a single email string or array of emails
  - Falls back to configured default recipients if not provided

- **subject** (string, required): Email subject line
  - Falls back to configured default subject if not provided

- **html** (string, optional): HTML content of the email
  - Mutually usable with `text`, can send both

- **text** (string, optional): Plain text content of the email
  - Mutually usable with `html`, can send both

- **bcc** (string | string[], optional): Blind carbon copy recipient(s)
  - Can be a single email string or array of emails

- **cc** (string | string[], optional): Carbon copy recipient(s)
  - Can be a single email string or array of emails

- **reply_to** (string | string[], optional): Reply-to address(es)
  - Can be a single email string or array of emails

- **headers** (object, optional): Custom email headers
  - Key-value pairs of header names and values

**Success Response**:
```typescript
{
  data: {
    id: string  // The ID of the newly created email
  },
  error: null
}
```

**Error Response**:
```typescript
{
  data: null,
  error: {
    message: string,
    name: string  // Error code key (see Error Codes below)
  }
}
```

**Error Codes**:
Map of error code keys to HTTP status codes:

| Error Code Key | HTTP Status | Description |
|----------------|-------------|-------------|
| `missing_required_field` | 422 | Required field is missing |
| `invalid_access` | 422 | Invalid access |
| `invalid_parameter` | 422 | Invalid parameter value |
| `invalid_region` | 422 | Invalid region |
| `rate_limit_exceeded` | 429 | API rate limit exceeded |
| `missing_api_key` | 401 | API key not provided |
| `invalid_api_Key` | 403 | API key is invalid |
| `invalid_from_address` | 403 | From address is invalid |
| `validation_error` | 403 | Validation error |
| `not_found` | 404 | Resource not found |
| `method_not_allowed` | 405 | HTTP method not allowed |
| `application_error` | 500 | Application error |
| `internal_server_error` | 500 | Internal server error |

**Implementation Notes**:
1. The tool should accept all parameters and merge them with any configured defaults
2. Parameters provided to the tool should override defaults
3. The API request body should be JSON encoded
4. The response should be parsed as JSON and returned in the format specified above

## Additional Features & Context

### React Email Template Support
The original app supports rendering React email templates to HTML using `@react-email/render`. For the MCP implementation:
- Users can use external tools to generate HTML from templates
- The MCP tool should accept pre-rendered HTML via the `html` parameter
- No need to implement React rendering in the MCP itself

### Use Cases
1. **Transactional Emails**: Order confirmations, password resets, notifications
2. **Marketing Emails**: Newsletters, promotional campaigns
3. **Form Submissions**: Contact forms, feedback forms

### API Key Generation
Users need to:
1. Create account at https://resend.com/signup
2. Generate API key at https://resend.com/api-keys
3. Store the API key securely (it cannot be viewed again after creation)

### Domain Configuration
- Default sender domain is `onboarding@resend.dev` (Resend's domain)
- For production use, users should configure their own domain through Resend's dashboard
- Custom domains require DNS verification

## Example Usage Scenarios

### Scenario 1: Simple Text Email
```json
{
  "to": "user@example.com",
  "subject": "Welcome to our service",
  "text": "Thank you for signing up!"
}
```

### Scenario 2: HTML Email with Multiple Recipients
```json
{
  "to": ["user1@example.com", "user2@example.com"],
  "subject": "Monthly Newsletter",
  "html": "<h1>Hello!</h1><p>Here's our monthly update...</p>"
}
```

### Scenario 3: Full-Featured Email
```json
{
  "from": "Support Team <support@mycompany.com>",
  "to": "customer@example.com",
  "subject": "Your Order #12345",
  "html": "<html><body><h1>Order Confirmation</h1>...</body></html>",
  "text": "Order Confirmation - Your order #12345 has been received",
  "cc": "manager@mycompany.com",
  "reply_to": "support@mycompany.com"
}
```

## Implementation Checklist

For your TypeScript MCP implementation:

- [ ] Configure Resend API client with base URL and authentication
- [ ] Implement `send_email` tool with all parameters
- [ ] Handle optional default configuration (from, to, subject)
- [ ] Parameter validation (at least one of html/text must be provided)
- [ ] Proper error handling and error code mapping
- [ ] Return structured response with data/error format
- [ ] Support both single string and array formats for to/cc/bcc/reply_to
- [ ] Document tool usage and parameters for MCP consumers

## Security Considerations

1. **API Key Storage**: Store API keys securely, never expose in logs or error messages
2. **Rate Limiting**: Implement appropriate rate limiting to avoid hitting API limits
3. **Email Validation**: Consider validating email formats before sending to API
4. **Content Sanitization**: If accepting user input for email content, ensure proper sanitization
5. **HTTPS Only**: All API communication must use HTTPS
