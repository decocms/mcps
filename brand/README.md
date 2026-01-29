# Brand MCP

AI-powered brand research and design system generator. Automatically discover brand identity from websites and generate complete design systems.

## Features

- **Website Scraping** - Extract colors, fonts, logos directly from websites using Firecrawl
- **AI Research** - Deep brand research using Perplexity AI
- **Design System Generation** - CSS variables, JSX components, markdown style guides
- **MCP Apps UI** - Interactive brand previews in Mesh admin
- **One-Step Creation** - Full workflow from URL to complete design system

## Quick Start

```bash
# Start the server
bun run dev

# The MCP will be available at:
# http://localhost:8001/mcp
```

## Required Bindings

Configure at least one binding for brand research:

### Firecrawl (`@deco/firecrawl`)
- Extract colors from website CSS
- Identify typography and fonts
- Find logo images in page source
- Capture visual style and aesthetics
- Take screenshots

### Perplexity (`@deco/perplexity`)
- Research brand history and background
- Find brand guidelines and press kits
- Discover logo URLs and assets
- Analyze brand voice and personality
- Find color palettes from various sources

## Tools

### Research Tools

| Tool | Description |
|------|-------------|
| `BRAND_SCRAPE` | Scrape a website to extract brand identity using Firecrawl |
| `BRAND_RESEARCH` | Deep research on a brand using Perplexity AI |
| `BRAND_DISCOVER` | Combined scraping + research for complete identity |
| `BRAND_STATUS` | Check available research capabilities |

### Generator Tools

| Tool | Description |
|------|-------------|
| `BRAND_GENERATE` | Generate design system from brand identity |
| `BRAND_CREATE` | Full workflow: discover + generate in one step |

## MCP Apps (UI Resources)

| Resource URI | Description |
|--------------|-------------|
| `ui://brand-preview` | Interactive brand identity preview |
| `ui://brand-list` | Grid view of all created brands |

## Workflow

### Quick: One-Step Brand Creation

```
BRAND_CREATE(brandName: "Acme Corp", websiteUrl: "https://acme.com")
```

Returns:
- Complete brand identity object
- CSS variables file
- JSX design system
- Markdown style guide

### Detailed: Step-by-Step

1. **Check Status**
   ```
   BRAND_STATUS()
   ```
   Verify which bindings are available.

2. **Discover Brand**
   ```
   BRAND_DISCOVER(brandName: "Acme", websiteUrl: "https://acme.com")
   ```
   Combines scraping and research for complete identity.

3. **Generate Design System**
   ```
   BRAND_GENERATE(identity: {...}, outputFormat: "all")
   ```
   Creates CSS, JSX, and style guide.

## Output Formats

### CSS Variables

```css
:root {
  --brand-primary: #8B5CF6;
  --brand-primary-light: #A78BFA;
  --brand-secondary: #10B981;
  --bg-dark: #1a1a1a;
  --font-heading: 'Inter', system-ui, sans-serif;
  /* ... */
}
```

### JSX Design System

```jsx
// Brand configuration
const BRAND = {
  name: "Acme Corp",
  colors: { primary: "#8B5CF6", ... },
  logos: { primary: "https://...", ... },
};

// Components
function BrandLogo({ variant, height }) { ... }
function Heading({ level, children }) { ... }
function Button({ variant, children }) { ... }
function Card({ children }) { ... }
```

### Markdown Style Guide

Complete documentation including:
- Color palette with hex codes
- Typography specifications
- Logo usage guidelines
- Visual style rules
- Brand voice description

## Brand Identity Schema

```typescript
interface BrandIdentity {
  name: string;
  tagline?: string;
  description?: string;
  industry?: string;
  
  colors: {
    primary: string;      // Main brand color
    secondary?: string;   // Supporting color
    accent?: string;      // Highlight color
    background?: string;  // Background color
    text?: string;        // Text color
    palette?: string[];   // Full palette
  };
  
  logos?: {
    primary?: string;     // Main logo URL
    light?: string;       // For dark backgrounds
    dark?: string;        // For light backgrounds
    icon?: string;        // Square icon
  };
  
  typography?: {
    headingFont?: string;
    bodyFont?: string;
    monoFont?: string;
  };
  
  style?: {
    aesthetic?: string;   // e.g., "modern", "minimal"
    mood?: string;        // e.g., "professional", "playful"
    keywords?: string[];
  };
  
  voice?: {
    tone?: string;
    personality?: string[];
    values?: string[];
  };
  
  confidence: "high" | "medium" | "low";
  sources: string[];
}
```

## Integration with Slides MCP

The Brand MCP is designed to work seamlessly with the Slides MCP:

1. Create a brand with `BRAND_CREATE`
2. Use the generated identity with Slides' `DECK_INIT`
3. The design system JSX can be used directly

## Development

```bash
# Install dependencies
bun install

# Run development server
bun run dev

# Type check
bun run check

# Build for production
bun run build
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8001` | Server port |

## License

MIT
