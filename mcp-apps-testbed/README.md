# MCP Apps Testbed

A reference implementation for testing [MCP Apps (SEP-1865)](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1865) — interactive user interfaces for the Model Context Protocol.

## What is this?

This is a simple MCP server that provides example tools with associated UI widgets. It's designed to:

1. **Test MCP Apps integration** in host applications like Mesh
2. **Demonstrate responsive design patterns** for MCP App UIs
3. **Serve as a reference** for building your own MCP Apps

## Quick Start

```bash
# Install dependencies
bun install

# Run the server (uses stdio transport)
bun run dev
```

Then add it as a connection in Mesh:

- **Transport**: STDIO
- **Command**: `bun`
- **Args**: `/path/to/mcp-apps-testbed/server/main.ts`

## Available Widgets (10 total)

| Tool | Description | UI Resource |
|------|-------------|-------------|
| `counter` | Interactive counter with +/- controls | `ui://counter-app` |
| `show_metric` | Display a key metric with trend indicator | `ui://metric` |
| `show_progress` | Visual progress bar with percentage | `ui://progress` |
| `greet` | Personalized greeting card | `ui://greeting-app` |
| `show_chart` | Animated bar chart visualization | `ui://chart-app` |
| `start_timer` | Countdown timer with start/pause | `ui://timer` |
| `show_status` | Status badge with colored indicator | `ui://status` |
| `show_quote` | Quote display with attribution | `ui://quote` |
| `show_sparkline` | Compact inline trend chart | `ui://sparkline` |
| `show_code` | Code snippet with syntax styling | `ui://code` |

## Responsive Design

All widgets adapt to three display modes:

| Mode | Height | Layout | Use Case |
|------|--------|--------|----------|
| **Collapsed** | < 450px | Horizontal/compact | Default in chat |
| **Expanded** | 450-750px | Vertical/spacious | Expanded view in chat |
| **View** | > 750px | Full experience | Resource preview |

### Design Philosophy

- **Collapsed = Compact**: Content arranged horizontally, essential elements only
- **Expanded = Breathable**: Content stacked vertically, more details visible
- **View = Complete**: All information displayed, full interactivity

This mirrors how iOS widgets adapt between compact and expanded states.

### CSS Breakpoints

```css
/* Default: Collapsed (horizontal) */
.container {
  display: flex;
  flex-direction: row;
}

/* Expanded: Vertical layout */
@media (min-height: 450px) {
  .container {
    flex-direction: column;
  }
}

/* View: Full experience */
@media (min-height: 750px) {
  /* Additional details, larger typography */
}
```

## Design Tokens

The widgets use a consistent design system:

```javascript
{
  bg: "#ffffff",
  bgSubtle: "#f9fafb",
  border: "#e5e7eb",
  text: "#111827",
  textMuted: "#6b7280",
  textSubtle: "#9ca3af",
  primary: "#6366f1",
  success: "#10b981",
  destructive: "#ef4444",
}
```

## Project Structure

```
mcp-apps-testbed/
├── server/
│   ├── main.ts           # MCP server entry point
│   └── lib/
│       └── resources.ts  # UI widget HTML definitions
├── package.json
└── README.md
```

## How MCP Apps Work

1. **Tools declare UI associations** via `_meta["ui/resourceUri"]`
2. **Resources provide HTML content** with MIME type `text/html;profile=mcp-app`
3. **Host renders in sandboxed iframe** and communicates via JSON-RPC postMessage
4. **UI receives tool input/result** via `ui/initialize` and can call tools back

### Example Tool Definition

```typescript
{
  name: "counter",
  description: "An interactive counter",
  inputSchema: {
    type: "object",
    properties: {
      initialValue: { type: "number", default: 0 }
    }
  },
  _meta: { "ui/resourceUri": "ui://counter" }
}
```

### Example UI Message Handling

```javascript
window.addEventListener('message', e => {
  const msg = JSON.parse(e.data);
  
  if (msg.method === 'ui/initialize') {
    // Access tool input and result
    const { toolInput, toolResult, toolName } = msg.params;
    
    // Initialize your UI...
    
    // Respond to host
    parent.postMessage(JSON.stringify({
      jsonrpc: '2.0',
      id: msg.id,
      result: {}
    }), '*');
  }
});
```

## Development

```bash
# Run with hot reload
bun run dev

# Type check
bun run check

# Build for production
bun run build
```

## License

MIT
