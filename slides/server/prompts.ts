/**
 * Slides MCP Prompts
 *
 * These prompts guide the workflow for creating presentations.
 * They work WITH the tools to establish a clear flow:
 *
 * ## File Structure
 *
 * ~/slides/                        # Root workspace (configurable)
 * ├── brands/                      # Reusable design systems
 * │   ├── {brand-name}/
 * │   │   ├── design-system.jsx    # Brand components (JSX)
 * │   │   ├── styles.css           # Brand styles
 * │   │   ├── style.md             # AI style guide
 * │   │   └── design.html          # Design system viewer
 * │   └── ...
 * └── decks/                       # Presentations
 *     ├── {deck-name}/
 *     │   ├── index.html           # Entry point
 *     │   ├── engine.jsx           # Presentation engine
 *     │   ├── design-system.jsx    # (copied from brand)
 *     │   ├── styles.css           # (copied from brand)
 *     │   └── slides/
 *     │       ├── manifest.json
 *     │       └── *.json           # Individual slides
 *     └── ...
 *
 * ## Workflow
 *
 * Phase 1: SETUP (one-time per brand)
 *   1. SLIDES_SETUP_BRAND - Research brand and create design system
 *   2. Show design system viewer to user for approval
 *   3. Save approved design system in brands/{brand}/
 *
 * Phase 2: CREATE (per presentation)
 *   1. SLIDES_NEW_DECK - Create a new deck using saved design system
 *   2. SLIDES_ADD_CONTENT - Add slides with content
 */

// Default workspace location
const DEFAULT_WORKSPACE = "~/slides";

import { createPrompt, type GetPromptResult } from "@decocms/runtime";
import { z } from "zod";
import type { Env } from "./main.ts";

/**
 * SLIDES_SETUP_BRAND - Research and create a brand design system
 */
export const createSetupBrandPrompt = (_env: Env) =>
  createPrompt({
    name: "SLIDES_SETUP_BRAND",
    title: "Setup Brand Design System",
    description: `Create a new brand design system for presentations. This is the FIRST step for a new brand.

The agent should:
1. Research the brand (website, existing materials, style guides)
2. Extract colors, typography, logo treatment, and visual style
3. Create a customized design system
4. Generate sample slides showing all layouts
5. Show the design system viewer (/design.html) for user approval

Files are saved to: {workspace}/brands/{brand-slug}/
Once approved, the design system can be reused for all future presentations.`,
    argsSchema: {
      brandName: z
        .string()
        .describe("Company or brand name (e.g., 'Acme Corp')"),
      brandWebsite: z
        .string()
        .optional()
        .describe("Brand website URL for research (e.g., 'https://acme.com')"),
      styleNotes: z
        .string()
        .optional()
        .describe("Any specific style notes or preferences"),
      workspace: z
        .string()
        .optional()
        .describe("Workspace root (default: ~/slides)"),
    },
    execute: ({ args }): GetPromptResult => {
      const { brandName, brandWebsite, styleNotes } = args;
      const workspace = args.workspace || DEFAULT_WORKSPACE;
      const brandSlug = brandName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-+$/, "");
      const brandPath = `${workspace}/brands/${brandSlug}`;

      return {
        description: `Create a design system for ${brandName}`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `# Create Brand Design System: ${brandName}

## File Structure
This will create a reusable brand at:
\`\`\`
${brandPath}/
├── design-system.jsx    # Brand components (logo, slides)
├── styles.css           # Brand colors, typography
├── style.md             # AI style guide
└── design.html          # Component viewer
\`\`\`

## Your Task
Create a complete presentation design system for **${brandName}**.

## Research Phase
${
  brandWebsite
    ? `1. Visit ${brandWebsite} to understand the brand identity
2. Extract: primary colors, secondary colors, typography, logo usage, visual style`
    : "1. Ask the user for brand colors, fonts, and style preferences"
}
${styleNotes ? `\nUser notes: ${styleNotes}` : ""}

## Creation Phase

### Step 1: Ensure workspace exists
\`\`\`bash
mkdir -p ${brandPath}
\`\`\`

### Step 2: Generate brand files
Call \`DECK_INIT\` with:
- title: "${brandName} Design System"
- brandName: "${brandName}"
- brandTagline: (extract from research or ask user)
- brandColor: (primary brand color from research)

### Step 3: Save ONLY brand files
From DECK_INIT output, write these to ${brandPath}/:
- design-system.jsx
- styles.css
- style.md
- design.html

(Do NOT save index.html, engine.jsx, or slides/ - those go in decks)

### Step 4: Start preview server
\`\`\`bash
cd ${brandPath} && npx serve
\`\`\`
(Or: \`python -m http.server 8890\`)

### Step 5: Show design system viewer
Navigate to http://localhost:8890/design.html

Ask: "Here's the design system for ${brandName}. Does this match your brand?"

## Iteration
If changes needed:
- Edit design-system.jsx for component changes
- Edit styles.css for colors/typography
- Refresh design.html to preview

## Completion
When approved:
"✓ Brand '${brandName}' saved to ${brandPath}/
You can now create presentations with: SLIDES_NEW_DECK(brand: '${brandSlug}')"`,
            },
          },
        ],
      };
    },
  });

/**
 * SLIDES_NEW_DECK - Create a new presentation using an existing design system
 */
export const createNewDeckPrompt = (_env: Env) =>
  createPrompt({
    name: "SLIDES_NEW_DECK",
    title: "Create New Presentation",
    description: `Create a new slide deck using an existing brand design system.

Prerequisites:
- Brand design system already created (via SLIDES_SETUP_BRAND)
- Brand exists at {workspace}/brands/{brand}/

The agent will:
1. Copy the design system from the brand
2. Initialize a new deck with the presentation title
3. Create slides based on user content
4. Preview and iterate until satisfied`,
    argsSchema: {
      title: z
        .string()
        .describe("Presentation title (e.g., 'Q4 2025 Results')"),
      brand: z
        .string()
        .describe("Brand slug (e.g., 'acme' - must exist in brands/)"),
      deckName: z
        .string()
        .optional()
        .describe("Deck folder name (default: generated from title)"),
      outline: z
        .string()
        .optional()
        .describe("Optional slide outline or key points to cover"),
      workspace: z
        .string()
        .optional()
        .describe("Workspace root (default: ~/slides)"),
    },
    execute: ({ args }): GetPromptResult => {
      const { title, brand, outline } = args;
      const workspace = args.workspace || DEFAULT_WORKSPACE;
      const deckSlug =
        args.deckName ||
        title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/-+$/, "");
      const brandPath = `${workspace}/brands/${brand}`;
      const deckPath = `${workspace}/decks/${deckSlug}`;

      return {
        description: `Create presentation: ${title}`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `# Create New Presentation: ${title}

## File Structure
\`\`\`
${deckPath}/
├── index.html           # Entry point
├── engine.jsx           # Presentation engine
├── design-system.jsx    # (from brand)
├── styles.css           # (from brand)
└── slides/
    ├── manifest.json
    └── *.json           # Slide content
\`\`\`

## Step 1: Verify brand exists
\`\`\`bash
ls ${brandPath}/design-system.jsx
\`\`\`
If brand doesn't exist, tell user to run SLIDES_SETUP_BRAND first.

## Step 2: Create deck directory
\`\`\`bash
mkdir -p ${deckPath}/slides
\`\`\`

## Step 3: Copy brand files
\`\`\`bash
cp ${brandPath}/design-system.jsx ${deckPath}/
cp ${brandPath}/styles.css ${deckPath}/
\`\`\`

## Step 4: Generate deck files
Call \`DECK_INIT\` with:
- title: "${title}"
- (brandName/brandColor not needed - using existing brand)

Write to ${deckPath}/:
- index.html
- engine.jsx
- slides/manifest.json

(Do NOT overwrite design-system.jsx and styles.css - they came from brand)

## Step 5: Create slides
${
  outline
    ? `Create slides based on this outline:
${outline}`
    : "Ask the user what slides they need."
}

Use \`SLIDE_CREATE\` for each slide:
- **title**: Opening slide
- **content**: Main points with bullets
- **stats**: Metrics and KPIs
- **two-column**: Comparisons
- **list**: Feature grids

Write each slide to ${deckPath}/slides/
Update manifest.json with slide order.

## Step 6: Preview
\`\`\`bash
cd ${deckPath} && npx serve
\`\`\`
(Or: \`python -m http.server 8891\`)

Navigate to http://localhost:8891/ and walk through with user.

## Finalize
When satisfied:
"✓ Deck saved to ${deckPath}/
Want me to bundle it into a single portable HTML? (DECK_BUNDLE)"`,
            },
          },
        ],
      };
    },
  });

/**
 * SLIDES_ADD_CONTENT - Add slides to an existing deck
 */
export const createAddContentPrompt = (_env: Env) =>
  createPrompt({
    name: "SLIDES_ADD_CONTENT",
    title: "Add Slides to Deck",
    description: `Add new slides to an existing presentation.

Use this when:
- Adding more slides to a deck in progress
- User provides new content to add
- Expanding on existing topics`,
    argsSchema: {
      deck: z.string().describe("Deck name (e.g., 'q4-results')"),
      content: z
        .string()
        .describe("Content to add (can be notes, bullet points, data, etc.)"),
      workspace: z
        .string()
        .optional()
        .describe("Workspace root (default: ~/slides)"),
    },
    execute: ({ args }): GetPromptResult => {
      const { deck, content } = args;
      const workspace = args.workspace || DEFAULT_WORKSPACE;
      const deckPath = `${workspace}/decks/${deck}`;

      return {
        description: "Add slides with provided content",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `# Add Slides to: ${deck}

## Deck Location
${deckPath}/

## Content to Add
${content}

## Instructions
1. Read ${deckPath}/slides/manifest.json to see existing slides
2. Analyze content and choose layouts:
   - Data/numbers → stats
   - Comparisons → two-column
   - Features/lists → list
   - General content → content

3. Use \`SLIDE_CREATE\` for each new slide
4. Write slide JSON files to ${deckPath}/slides/
5. Update manifest.json with new slides

## Preview
Refresh browser to see new slides. Ask if adjustments needed.`,
            },
          },
        ],
      };
    },
  });

/**
 * SLIDES_QUICK_START - Fast path for simple presentations
 */
export const createQuickStartPrompt = (_env: Env) =>
  createPrompt({
    name: "SLIDES_QUICK_START",
    title: "Quick Start Presentation",
    description: `Create a presentation quickly with minimal setup.

Use when:
- User wants a quick presentation without brand setup
- Simple one-off presentations
- Demos and prototypes

Uses a generic brand and creates deck directly.`,
    argsSchema: {
      title: z.string().describe("Presentation title"),
      topic: z.string().describe("What the presentation is about"),
      slideCount: z
        .string()
        .optional()
        .describe("Approximate number of slides (default: 5-7)"),
      workspace: z
        .string()
        .optional()
        .describe("Workspace root (default: ~/slides)"),
    },
    execute: ({ args }): GetPromptResult => {
      const { title, topic } = args;
      const workspace = args.workspace || DEFAULT_WORKSPACE;
      const count = args.slideCount || "5-7";
      const deckSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-+$/, "");
      const deckPath = `${workspace}/decks/${deckSlug}`;

      return {
        description: `Quick presentation: ${title}`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `# Quick Start: ${title}

## Target
${deckPath}/

## Create a ${count} slide presentation about: ${topic}

### Step 1: Create deck directory
\`\`\`bash
mkdir -p ${deckPath}/slides
\`\`\`

### Step 2: Initialize with generic brand
Call \`DECK_INIT\` with:
- title: "${title}"
- brandName: "Presenter"
- brandColor: "#3B82F6"

Write ALL files to ${deckPath}/

### Step 3: Create slides
Generate ${count} slides covering ${topic}:
1. **title** - Opening: "${title}"
2. **content** - Key points about ${topic}
3. **stats** - (if data available)
4. **content** or **list** - Details
5. **title** or **content** - Closing/summary

Use \`SLIDE_CREATE\` for each, write to ${deckPath}/slides/

### Step 4: Preview
\`\`\`bash
cd ${deckPath} && npx serve
\`\`\`
(Or: \`python -m http.server 8892\`)

Open http://localhost:8892/

### Step 5: Iterate
"Here's your presentation. What would you like to change?"`,
            },
          },
        ],
      };
    },
  });

/**
 * SLIDES_LIST - List available brands and decks
 */
export const createListPrompt = (_env: Env) =>
  createPrompt({
    name: "SLIDES_LIST",
    title: "List Brands and Decks",
    description: `Show available brands and existing decks in the workspace.

Use this to:
- See what brands are available
- Find existing decks
- Understand the current workspace state`,
    argsSchema: {
      workspace: z
        .string()
        .optional()
        .describe("Workspace root (default: ~/slides)"),
    },
    execute: ({ args }): GetPromptResult => {
      const workspace = args.workspace || DEFAULT_WORKSPACE;

      return {
        description: "List available brands and decks",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `# List Slides Workspace

## Workspace
${workspace}/

## Check Brands
\`\`\`bash
echo "=== BRANDS ===" && ls -la ${workspace}/brands/ 2>/dev/null || echo "(no brands yet)"
\`\`\`

## Check Decks
\`\`\`bash
echo "=== DECKS ===" && ls -la ${workspace}/decks/ 2>/dev/null || echo "(no decks yet)"
\`\`\`

## Summary
For each brand, show:
- Brand name
- Primary color (from styles.css)

For each deck, show:
- Deck name
- Number of slides (from manifest.json)
- Brand used (if identifiable)

## Suggest Next Action
If no brands: "Create a brand with SLIDES_SETUP_BRAND"
If brands exist but no decks: "Create a deck with SLIDES_NEW_DECK"
If both exist: "Ready to create presentations!"`,
            },
          },
        ],
      };
    },
  });

/**
 * Export all prompt factories
 */
export const prompts = (env: Env) => [
  createSetupBrandPrompt(env),
  createNewDeckPrompt(env),
  createAddContentPrompt(env),
  createQuickStartPrompt(env),
  createListPrompt(env),
];
