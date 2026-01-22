# GitHub Events MCP

A GitHub webhook event hub for the MCP Mesh Event Bus. This MCP receives GitHub webhooks and publishes them as typed events that other MCPs can subscribe to.

## Features

- **GitHub App OAuth Flow**: Multi-tenant support for GitHub App installations
- **Automatic Webhook Registration**: Webhooks are automatically registered via `onChange`
- **User-Configurable Events**: Select which GitHub events to subscribe to via StateSchema
- **Webhook Signature Validation**: Secure webhook verification using HMAC-SHA256
- **Event Publishing**: Publishes typed events to the MCP Mesh Event Bus

## Architecture

```
GitHub Repository → GitHub Webhook → Streamable Tool Endpoint → Event Bus → Other MCPs
```

### Webhook Endpoint

After OAuth authentication, webhooks point to:
```
${meshUrl}/mcp/${connectionId}/call-tool/GITHUB_WEBHOOK
```

### Published Events

Events are published in the format `github.<event_type>.<action>`:
- `github.push` - Code pushed to repository
- `github.pull_request.opened` - Pull request opened
- `github.pull_request.closed` - Pull request closed
- `github.issues.opened` - Issue created
- `github.release.published` - Release published
- etc.

## Setup

### 1. Create a GitHub App

1. Go to GitHub Settings → Developer settings → GitHub Apps → New GitHub App
2. Configure the app:
   - **GitHub App name**: Choose a unique name
   - **Homepage URL**: Your application URL
   - **Webhook URL**: Leave blank (we'll set this programmatically)
   - **Webhook secret**: Generate a secret and save it
   - **Permissions**: 
     - Repository permissions:
       - Contents: Read-only
       - Metadata: Read-only
       - Webhooks: Read and write
     - Organization permissions (optional):
       - Webhooks: Read and write

3. After creating the app, note down:
   - App ID
   - Client ID
   - Client Secret
   - Generate a private key

### 2. Environment Variables

```bash
GITHUB_APP_ID=<your-app-id>
GITHUB_APP_NAME=<your-app-name>
GITHUB_CLIENT_ID=<client-id>
GITHUB_CLIENT_SECRET=<client-secret>
GITHUB_WEBHOOK_SECRET=<webhook-secret>
```

### 3. Install the MCP

Install the GitHub Events MCP in your MCP Mesh organization and complete the OAuth flow.

### 4. Configure Events

In the MCP configuration, select which webhook events to subscribe to:
- `push`
- `pull_request`
- `issues`
- `release`
- And many more...

## Subscribing to Events

Other MCPs can subscribe to GitHub events via the Event Bus:

```typescript
events: {
  handlers: {
    EVENT_BUS: {
      events: ["github.push", "github.pull_request.*", "github.issues.*"],
      handler: async ({ events }) => {
        for (const event of events) {
          console.log(`Received: ${event.type}`, event.data);
          // Handle the event...
        }
        return { success: true };
      },
    },
  },
}
```

## Event Payload

Each event includes:
- `type`: Event type (e.g., `github.pull_request.opened`)
- `subject`: Repository full name (e.g., `owner/repo`)
- `data`: Full GitHub webhook payload plus:
  - `_github_event`: Original GitHub event type
  - `_github_delivery_id`: Unique delivery ID

## Development

```bash
# Install dependencies
bun install

# Run in development mode
bun run dev

# Run with Mesh linking
bun run dev:link

# Type check
bun run check

# Build for production
bun run build
```

## Available Tools

### GITHUB_WEBHOOK (Streamable)
Receives GitHub webhook events. Called directly by GitHub.

### list_repositories
List all repositories accessible to the GitHub App installation.

### list_webhooks
List all webhooks registered by this MCP.

## License

MIT

