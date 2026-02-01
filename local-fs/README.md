# @decocms/mcp-local-fs

Mount any local filesystem path as an MCP server. **Drop-in replacement** for the official MCP filesystem server, with additional MCP Mesh collection bindings.

## Features

- 📁 Mount any filesystem path dynamically
- 🔌 **Stdio transport** (default) - works with Claude Desktop, Cursor, and other MCP clients
- 🌐 **HTTP transport** - for MCP Mesh integration
- 🛠️ **Full MCP filesystem compatibility** - same tools as the official server
- 📋 **Collection bindings** for Files and Folders (Mesh-compatible)
- 🔄 **Backward compatible** - supports both official and Mesh tool names
- ⚡ Zero config needed

## Quick Start

### Using npx (stdio mode - recommended for Claude Desktop)

```bash
# Mount current directory
npx @decocms/mcp-local-fs

# Mount specific path
npx @decocms/mcp-local-fs /path/to/folder

# Or with --path flag
npx @decocms/mcp-local-fs --path /path/to/folder
```

### Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "local-fs": {
      "command": "npx",
      "args": ["@decocms/mcp-local-fs", "/path/to/folder"]
    }
  }
}
```

### Cursor Configuration

Add to your Cursor MCP settings:

```json
{
  "mcpServers": {
    "local-fs": {
      "command": "npx",
      "args": ["@decocms/mcp-local-fs", "/path/to/folder"]
    }
  }
}
```

### Serve Mode with deco link (easiest for remote Mesh)

**One command to expose your local files to Deco Mesh:**

```bash
# Serve current directory with public URL
cd /path/to/your/project
bun run serve                    # if installed locally
bunx @decocms/mcp-local-fs serve # via bunx

# Serve specific folder
bunx @decocms/mcp-local-fs serve /path/to/folder

# With custom port
bunx @decocms/mcp-local-fs serve --port 8080
```

This will:
1. Start the HTTP server locally
2. Create a public tunnel via `deco link`
3. Display a ready-to-add MCP URL
4. Copy the URL to your clipboard

Just paste the URL in Deco Mesh > Connections > Add Custom MCP!

### HTTP Mode (for local Mesh)

```bash
# Start HTTP server on port 3456
npx @decocms/mcp-local-fs --http

# With custom port
npx @decocms/mcp-local-fs --http --port 8080

# Mount specific path
npx @decocms/mcp-local-fs --http --path /your/folder
```

Then connect using:
- `http://localhost:3456/mcp?path=/your/folder`
- `http://localhost:3456/mcp/your/folder`

## Adding to MCP Mesh

Add a new connection with:
- **Transport**: HTTP  
- **URL**: `http://localhost:3456/mcp?path=/your/folder`

Or use the path in URL format:
- **URL**: `http://localhost:3456/mcp/home/user/documents`

## Available Tools

### Official MCP Filesystem Tools

These tools follow the exact same schema as the [official MCP filesystem server](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem):

| Tool | Description |
|------|-------------|
| `read_file` | Read a file (deprecated, use `read_text_file`) |
| `read_text_file` | Read a text file with optional head/tail params |
| `read_media_file` | Read binary/media files as base64 |
| `read_multiple_files` | Read multiple files at once |
| `write_file` | Write content to a file |
| `edit_file` | Search/replace edits with diff preview |
| `create_directory` | Create a directory (with nested support) |
| `list_directory` | List files and directories |
| `list_directory_with_sizes` | List with file sizes |
| `directory_tree` | Recursive tree view as JSON |
| `move_file` | Move or rename files/directories |
| `search_files` | Search files by glob pattern |
| `get_file_info` | Get detailed file/directory metadata |
| `list_allowed_directories` | Show allowed directories |

### Additional Tools

| Tool | Description |
|------|-------------|
| `delete_file` | Delete a file or directory (with recursive option) |
| `copy_file` | Copy a file to a new location |

### MCP Mesh Collection Bindings

These tools provide standard collection bindings for MCP Mesh compatibility:

| Tool | Description |
|------|-------------|
| `COLLECTION_FILES_LIST` | List files with pagination |
| `COLLECTION_FILES_GET` | Get file metadata and content by path |
| `COLLECTION_FOLDERS_LIST` | List folders with pagination |
| `COLLECTION_FOLDERS_GET` | Get folder metadata by path |

### MCP Mesh Compatibility Aliases

For backward compatibility with existing Mesh connections, these aliases are also available:

| Mesh Tool | Maps To |
|-----------|---------|
| `FILE_READ` | `read_text_file` |
| `FILE_WRITE` | `write_file` |
| `FILE_DELETE` | `delete_file` |
| `FILE_MOVE` | `move_file` |
| `FILE_COPY` | `copy_file` |
| `FILE_MKDIR` | `create_directory` |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `MCP_LOCAL_FS_PATH` | Default path to mount |
| `PORT` | HTTP server port (default: 3456) |

## Development

```bash
# Install dependencies
npm install

# Run in stdio mode (development)
npm run dev:stdio

# Run in http mode (development)
npm run dev

# Run tests
npm test

# Type check
npm run check

# Build for distribution
npm run build
```

## License

MIT
