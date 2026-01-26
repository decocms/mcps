# Slides MCP

AI-powered presentation builder that creates beautiful, animated slide decks through natural conversation.

## Features

- **Brand-Aware Design Systems** - Create reusable design systems with your brand colors, typography, and logos
- **Multiple Slide Layouts** - Title, content, stats, two-column, list, quote, image, and custom layouts
- **Automatic Brand Research** - Optionally integrate Perplexity and Firecrawl to automatically discover brand assets
- **MCP Apps UI** - Interactive slide viewer and design system preview via MCP Apps resources
- **JSX + Babel** - Modern component-based slides with browser-side transpilation

## Quick Start

```bash
# Start the server
bun run dev

# The MCP will be available at:
# http://localhost:8001/mcp
```

## Tools

### Deck Management
| Tool | Description |
|------|-------------|
| `DECK_INIT` | Initialize a new presentation deck with brand assets |
| `DECK_INFO` | Get information about an existing deck |
| `DECK_BUNDLE` | Bundle a deck for sharing/export |
| `DECK_GET_ENGINE` | Get the presentation engine JSX |
| `DECK_GET_DESIGN_SYSTEM` | Get the design system JSX for a brand |

### Slide Operations
| Tool | Description |
|------|-------------|
| `SLIDE_CREATE` | Create a new slide with layout and content |
| `SLIDE_UPDATE` | Update an existing slide |
| `SLIDE_DELETE` | Delete a slide |
| `SLIDE_GET` | Get a single slide by ID |
| `SLIDE_LIST` | List all slides in a deck |
| `SLIDE_REORDER` | Reorder slides in a deck |
| `SLIDE_DUPLICATE` | Duplicate an existing slide |
| `SLIDES_PREVIEW` | Preview multiple slides in the viewer |

### Style Management
| Tool | Description |
|------|-------------|
| `STYLE_GET` | Get the style guide for a brand |
| `STYLE_SET` | Update the style guide |
| `STYLE_SUGGEST` | Get AI suggestions for style improvements |

### Brand Research (Optional)
| Tool | Description |
|------|-------------|
| `BRAND_RESEARCH` | Automatically discover brand assets from websites |
| `BRAND_RESEARCH_STATUS` | Check which research bindings are available |
| `BRAND_ASSETS_VALIDATE` | Validate and suggest missing brand assets |

## Prompts

| Prompt | Description |
|--------|-------------|
| `SLIDES_SETUP_BRAND` | Guide for creating a new brand design system |
| `SLIDES_NEW_DECK` | Create a new presentation deck |
| `SLIDES_ADD_CONTENT` | Add content slides to an existing deck |
| `SLIDES_QUICK_START` | Fast path for simple presentations |
| `SLIDES_LIST` | List available brands and decks |

## MCP Apps (UI Resources)

The MCP exposes interactive UI resources for displaying presentations:

| Resource URI | Description |
|--------------|-------------|
| `ui://slides-viewer` | Full presentation viewer with navigation |
| `ui://design-system` | Brand design system preview |
| `ui://slide` | Single slide preview |

These resources receive data via the `ui/initialize` message and render interactive HTML/JS applications.

## Slide Layouts

### Title Slide
Large background shape with brand accent, bold uppercase title, and logo.

### Content Slide
Main content with title, sections, bullet points, and footer.

### Stats Slide
Grid of 3-4 large numbers with labels (e.g., "2,847 Users", "89% Growth").

### Two-Column Slide
Side-by-side comparison with column titles and bullets.

### List Slide
2x2 grid of items with title and description.

### Quote Slide
Centered quote with attribution.

### Image Slide
Full background image with overlay text.

### Custom Slide
Raw HTML content for complete flexibility.

## Optional Bindings

Configure these bindings for automatic brand research:

### Perplexity (`@deco/perplexity`)
- Search for brand logo URLs
- Research brand colors and guidelines
- Find brand taglines and descriptions
- Discover press kits and media pages

### Firecrawl (`@deco/firecrawl`)
- Extract brand colors from website CSS
- Identify typography and fonts
- Find logo images in page source
- Capture full brand identity from live websites

When configured, use `BRAND_RESEARCH` before `DECK_INIT` to automatically populate brand assets.

## File Structure

```
~/slides/
├── brands/                      # Reusable design systems
│   └── {brand-name}/
│       ├── design-system.jsx    # Brand components (JSX)
│       ├── styles.css           # Brand styles
│       ├── style.md             # AI style guide
│       ├── brand-assets.json    # Logo URLs, colors
│       └── design.html          # Design system viewer
└── decks/                       # Presentations
    └── {deck-name}/
        ├── index.html           # Entry point
        ├── engine.jsx           # Presentation engine
        ├── design-system.jsx    # (copied from brand)
        ├── styles.css           # (copied from brand)
        └── slides/
            ├── manifest.json    # Slide order and metadata
            └── *.json           # Individual slides
```

## Workflow

### Phase 1: Brand Setup (one-time)
1. Use `SLIDES_SETUP_BRAND` prompt
2. Optionally run `BRAND_RESEARCH` to auto-discover assets
3. Create design system with `DECK_INIT`
4. Preview and iterate on brand styling

### Phase 2: Create Presentations
1. Use `SLIDES_NEW_DECK` prompt with existing brand
2. Add slides with `SLIDE_CREATE`
3. Preview with `SLIDES_PREVIEW`
4. Bundle for sharing with `DECK_BUNDLE`

## Development

```bash
# Install dependencies
bun install

# Run development server with hot reload
bun run dev

# Type check
bun run check

# Build for production
bun run build
```

## Configuration

The MCP uses the following environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8001` | Server port |

## License

MIT
