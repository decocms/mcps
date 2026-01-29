# MCP Gateway

Serve multiple MCPs through a single `deco link` tunnel with an interactive TUI setup.

## Why?

`deco link` creates one tunnel per machine. If you run multiple `serve` commands, they'll share the same tunnel URL and conflict. The gateway solves this by proxying multiple MCPs through different paths on a single port.

## Quick Start

```bash
cd mcps

# Interactive setup (first time)
bun run gateway:setup

# Start the gateway
bun run gateway
```

## Interactive Setup

The setup wizard lets you:
- Select which MCPs to run
- Configure the local-fs path
- Save your preferences for future runs

```
╔══════════════════════════════════════════════════════════════════════╗
║                    MCP Gateway Setup                                 ║
╚══════════════════════════════════════════════════════════════════════╝

Available MCPs:

  [✓] 1. Local FS
      Mount a local folder for file operations

  [✓] 2. Blog
      AI-powered blog writing with tone of voice guides

  [ ] 3. Bookmarks
      Bookmark management with AI enrichment

Commands:
  1-5   Toggle MCP
  a     Select all
  n     Select none
  Enter Continue
```

Your selection is saved to `.gateway.env` and loaded automatically on subsequent runs.

## CLI Usage

You can also skip setup and use CLI flags:

```bash
# Start with saved config
bun run gateway

# Override: specific MCPs
bun run gateway --blog --bookmarks

# Override: local-fs with path
bun run gateway --local-fs --path /Users/me/my-project
```

## Available MCPs

| ID | Name | Port | Description |
|----|------|------|-------------|
| `local-fs` | Local FS | 8001 | Mount a local folder |
| `blog` | Blog | 8002 | Blog writing with tone of voice |
| `bookmarks` | Bookmarks | 8003 | Bookmark management |
| `slides` | Slides | 8004 | Create presentations |
| `brand` | Brand | 8005 | Brand asset management |

## Routes

Each MCP is exposed at `/mcp-{id}`:
- `/mcp-local-fs` → local-fs MCP
- `/mcp-blog` → blog MCP
- `/mcp-bookmarks` → bookmarks MCP
- etc.

## Output

When the tunnel is ready, you'll see URLs like:

```
╔═══════════════════════════════════════════════════════════════════════╗
║                       ✅ Gateway Ready!                               ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  Add these MCP URLs to your Deco Mesh:                                ║
║                                                                       ║
║  local-fs     https://localhost-xxx.deco.host/mcp-local-fs            ║
║  blog         https://localhost-xxx.deco.host/mcp-blog                ║
║  bookmarks    https://localhost-xxx.deco.host/mcp-bookmarks           ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
```

Add each URL as a Custom MCP in Deco Mesh.

## Configuration File

The setup saves to `.gateway.env`:

```env
# MCP Gateway Configuration
MCPS=local-fs,blog,bookmarks
GATEWAY_PORT=8000
LOCAL_FS_PATH="/Users/me/my-project"
```

Edit this file directly or run `bun run gateway:setup` again.
