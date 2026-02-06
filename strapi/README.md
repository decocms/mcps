# Strapi CMS MCP

Integration with Strapi headless CMS for comprehensive content management.

## Features

- ✅ **Content Management** - Full CRUD operations on content entries
- ✅ **Content Types** - List and inspect available content types
- ✅ **Media Management** - Upload and manage media files
- ✅ **User Management** - Manage users and roles
- ✅ **Health Monitoring** - Check API connectivity

## Configuration

This MCP requires configuration via the Mesh UI:

- **strapiApiEndpoint**: Strapi API base URL (e.g., `https://your-strapi.com`)
- **strapiApiToken**: Strapi API authentication token (Bearer token)

### Getting API Token

1. Go to your Strapi admin panel
2. Navigate to Settings > API Tokens
3. Create a new token with appropriate permissions
4. Copy the token value
5. Configure in Mesh UI when installing this MCP

## Available Tools

### Content Management

- `STRAPI_GET_CONTENT` - List content entries with filtering, sorting, pagination
- `STRAPI_GET_CONTENT_BY_ID` - Get specific content entry by ID
- `STRAPI_CREATE_CONTENT` - Create new content entry (requires authorization)
- `STRAPI_UPDATE_CONTENT` - Update existing entry (requires authorization)
- `STRAPI_DELETE_CONTENT` - Delete entry (requires authorization)

### Content Types

- `STRAPI_CONTENT_TYPES` - List all available content types
- `STRAPI_CONTENT_TYPE_DETAIL` - Get detailed schema for specific type

### Media Management

- `STRAPI_GET_MEDIA` - List media files
- `STRAPI_GET_MEDIA_BY_ID` - Get specific media file
- `STRAPI_UPLOAD_MEDIA` - Upload new media (requires authorization)
- `STRAPI_UPDATE_MEDIA` - Update media metadata (requires authorization)
- `STRAPI_DELETE_MEDIA` - Delete media (requires authorization)
- `STRAPI_GET_MEDIA_FOLDERS` - List media folders

### User Management

- `STRAPI_GET_USERS` - List users
- `STRAPI_GET_USER_BY_ID` - Get user details
- `STRAPI_GET_CURRENT_USER` - Get current authenticated user
- `STRAPI_CREATE_USER` - Create user (requires authorization)
- `STRAPI_UPDATE_USER` - Update user (requires authorization)
- `STRAPI_DELETE_USER` - Delete user (requires authorization)

### Roles & Permissions

- `STRAPI_GET_ROLES` - List available roles
- `STRAPI_GET_ROLE_BY_ID` - Get role details
- `STRAPI_CREATE_ROLE` - Create role (requires authorization)
- `STRAPI_UPDATE_ROLE` - Update role (requires authorization)
- `STRAPI_DELETE_ROLE` - Delete role (requires authorization)
- `STRAPI_GET_PERMISSIONS` - List available permissions

### Health

- `STRAPI_HEALTH` - Check API connectivity and measure latency

## Authorization

POST, PUT, and DELETE operations require explicit user authorization and will trigger an authorization prompt in Mesh.

## Development

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

## Documentation

- [Strapi Documentation](https://docs.strapi.io/)
- [Strapi REST API](https://docs.strapi.io/dev-docs/api/rest)
