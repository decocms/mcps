# Google Tag Manager MCP

MCP Server for Google Tag Manager integration. Manage accounts, containers, workspaces, tags, triggers, and variables using the Google Tag Manager API v2.

## Features

### Account Management
- **list_accounts** - List all accessible GTM accounts
- **get_account** - Get details of a specific account

### Container Management
- **list_containers** - List containers in an account
- **get_container** - Get details of a specific container
- **create_container** - Create a new container
- **delete_container** - Delete a container

### Workspace Management
- **list_workspaces** - List workspaces in a container
- **get_workspace** - Get details of a specific workspace
- **create_workspace** - Create a new workspace

### Tag Management
- **list_tags** - List tags in a workspace
- **get_tag** - Get details of a specific tag
- **create_tag** - Create a new tag
- **update_tag** - Update an existing tag
- **delete_tag** - Delete a tag

### Trigger Management
- **list_triggers** - List triggers in a workspace
- **get_trigger** - Get details of a specific trigger
- **create_trigger** - Create a new trigger
- **update_trigger** - Update an existing trigger
- **delete_trigger** - Delete a trigger

### Variable Management
- **list_variables** - List variables in a workspace
- **get_variable** - Get details of a specific variable
- **create_variable** - Create a new variable
- **update_variable** - Update an existing variable
- **delete_variable** - Delete a variable

## Setup

### 1. Create Project in Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable **Google Tag Manager API**:
   - Sidebar → APIs & Services → Library
   - Search for "Tag Manager API" and enable it

### 2. Configure OAuth 2.0

1. Go to "APIs & Services" → "Credentials"
2. Click "Create credentials" → "OAuth client ID"
3. Select "Web application"
4. Configure:
   - Name: Google Tag Manager MCP
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

### List accounts

```json
{
  "tool": "list_accounts",
  "input": {}
}
```

### Get account details

```json
{
  "tool": "get_account",
  "input": {
    "accountId": "12345"
  }
}
```

### List containers

```json
{
  "tool": "list_containers",
  "input": {
    "accountId": "12345"
  }
}
```

### Create a new container

```json
{
  "tool": "create_container",
  "input": {
    "accountId": "12345",
    "name": "My Website Container",
    "usageContext": ["web"],
    "domainName": ["example.com"]
  }
}
```

### List workspaces

```json
{
  "tool": "list_workspaces",
  "input": {
    "accountId": "12345",
    "containerId": "67890"
  }
}
```

### Create a new workspace

```json
{
  "tool": "create_workspace",
  "input": {
    "accountId": "12345",
    "containerId": "67890",
    "name": "Feature Development",
    "description": "Workspace for developing new tracking features"
  }
}
```

### List tags

```json
{
  "tool": "list_tags",
  "input": {
    "accountId": "12345",
    "containerId": "67890",
    "workspaceId": "5"
  }
}
```

### Create a Google Analytics 4 tag

```json
{
  "tool": "create_tag",
  "input": {
    "accountId": "12345",
    "containerId": "67890",
    "workspaceId": "5",
    "name": "GA4 Configuration",
    "type": "gtagua",
    "parameter": [
      {
        "type": "template",
        "key": "measurementId",
        "value": "G-XXXXXXXXXX"
      }
    ],
    "firingTriggerId": ["2147479553"],
    "tagFiringOption": "oncePerEvent"
  }
}
```

### Create a custom HTML tag

```json
{
  "tool": "create_tag",
  "input": {
    "accountId": "12345",
    "containerId": "67890",
    "workspaceId": "5",
    "name": "Custom Tracking Script",
    "type": "html",
    "parameter": [
      {
        "type": "template",
        "key": "html",
        "value": "<script>console.log('Custom tracking');</script>"
      }
    ],
    "firingTriggerId": ["2147479553"]
  }
}
```

### Update a tag

```json
{
  "tool": "update_tag",
  "input": {
    "accountId": "12345",
    "containerId": "67890",
    "workspaceId": "5",
    "tagId": "10",
    "fingerprint": "1234567890123",
    "name": "Updated Tag Name",
    "paused": false
  }
}
```

### Create a page view trigger

```json
{
  "tool": "create_trigger",
  "input": {
    "accountId": "12345",
    "containerId": "67890",
    "workspaceId": "5",
    "name": "All Pages",
    "type": "pageview"
  }
}
```

### Create a custom event trigger

```json
{
  "tool": "create_trigger",
  "input": {
    "accountId": "12345",
    "containerId": "67890",
    "workspaceId": "5",
    "name": "Purchase Event",
    "type": "customEvent",
    "eventName": {
      "type": "template",
      "value": "purchase"
    }
  }
}
```

### Create a click trigger with filters

```json
{
  "tool": "create_trigger",
  "input": {
    "accountId": "12345",
    "containerId": "67890",
    "workspaceId": "5",
    "name": "Button Clicks",
    "type": "click",
    "filter": [
      {
        "type": "equals",
        "parameter": [
          {
            "type": "template",
            "key": "arg0",
            "value": "{{Click Element}}"
          },
          {
            "type": "template",
            "key": "arg1",
            "value": "button"
          }
        ]
      }
    ]
  }
}
```

### Create a constant variable

```json
{
  "tool": "create_variable",
  "input": {
    "accountId": "12345",
    "containerId": "67890",
    "workspaceId": "5",
    "name": "GA4 Measurement ID",
    "type": "c",
    "parameter": [
      {
        "type": "template",
        "key": "value",
        "value": "G-XXXXXXXXXX"
      }
    ]
  }
}
```

### Create a data layer variable

```json
{
  "tool": "create_variable",
  "input": {
    "accountId": "12345",
    "containerId": "67890",
    "workspaceId": "5",
    "name": "User ID",
    "type": "v",
    "parameter": [
      {
        "type": "integer",
        "key": "dataLayerVersion",
        "value": "2"
      },
      {
        "type": "template",
        "key": "name",
        "value": "userId"
      }
    ]
  }
}
```

### Delete a tag

```json
{
  "tool": "delete_tag",
  "input": {
    "accountId": "12345",
    "containerId": "67890",
    "workspaceId": "5",
    "tagId": "10"
  }
}
```

## Project Structure

```
google-tag-manager/
├── server/
│   ├── main.ts              # Entry point with OAuth
│   ├── constants.ts         # API URLs and constants
│   ├── lib/
│   │   ├── env.ts           # Access token helper
│   │   ├── gtm-client.ts    # API client
│   │   └── types.ts         # TypeScript types
│   └── tools/
│       ├── index.ts         # Exports all tools
│       ├── accounts.ts      # Account management
│       ├── containers.ts    # Container management
│       ├── workspaces.ts    # Workspace management
│       ├── tags.ts          # Tag management
│       ├── triggers.ts      # Trigger management
│       └── variables.ts     # Variable management
├── shared/
│   └── deco.gen.ts          # Environment types
├── app.json                 # MCP configuration
├── package.json
├── tsconfig.json
└── README.md
```

## OAuth Scopes

This MCP requests the following scopes:

- `https://www.googleapis.com/auth/tagmanager.edit.containers` - Edit containers
- `https://www.googleapis.com/auth/tagmanager.readonly` - Read-only access
- `https://www.googleapis.com/auth/tagmanager.manage.accounts` - Account management

## Common Tag Types

- `gtagua` - Google Analytics 4
- `ua` - Universal Analytics
- `awct` - Google Ads Conversion Tracking
- `sp` - Google Ads Remarketing
- `html` - Custom HTML
- `img` - Custom Image

## Common Trigger Types

- `pageview` - Page View
- `domReady` - DOM Ready
- `windowLoaded` - Window Loaded
- `customEvent` - Custom Event
- `click` - All Clicks
- `formSubmission` - Form Submission
- `timer` - Timer
- `scrollDepth` - Scroll Depth
- `elementVisibility` - Element Visibility
- `youTubeVideo` - YouTube Video
- `historyChange` - History Change

## Common Variable Types

- `c` - Constant
- `v` - Data Layer Variable
- `jsm` - JavaScript Variable
- `k` - First-Party Cookie
- `u` - URL
- `f` - Referrer
- `aev` - Auto-Event Variable
- `gas` - Google Analytics Settings

## Best Practices

1. **Always work in workspaces** - Never edit the live container directly
2. **Use descriptive names** - Make tags, triggers, and variables easy to identify
3. **Test before publishing** - Use GTM's preview mode to test changes
4. **Document with notes** - Add notes to complex configurations
5. **Use variables** - Reuse values with variables instead of hardcoding
6. **Organize with folders** - Use folder structure for large containers
7. **Check fingerprints** - Use fingerprints for optimistic locking when updating

## Error Handling

The MCP will throw errors for:

- Invalid credentials or expired tokens
- Missing required permissions
- Invalid account/container/workspace IDs
- Fingerprint mismatches (concurrent edits)
- API rate limits exceeded
- Invalid parameter values

## License

MIT

