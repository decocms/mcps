/**
 * Skills data - All deco skills with their content
 */

export interface SkillReference {
  name: string;
  path: string;
  content: string;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  mainContent: string;
  references: SkillReference[];
}

export const SKILLS: Record<string, Skill> = {
  "decocms-marketing-pages": {
    id: "decocms-marketing-pages",
    name: "DecoCMS Marketing Pages",
    description:
      "Compose on-brand marketing landing pages using existing decoCMS sections. Use when building product pages, feature announcements, campaign pages, or any public-facing marketing content.",
    mainContent: `# Building Marketing Pages in decoCMS

Create polished, on-brand marketing landing pages by composing existing decoCMS sections.

## Prerequisites (MUST READ FIRST)

Before using this skill, you MUST read these skills:
1. **deco-brand-guidelines** — Determines Light/Dark mode based on audience
2. **deco-product-positioning** — Determines Track 1 (Commerce) vs Track 2 (Platform) messaging
3. **deco-writing-style** — Determines copy tone, voice, and words to avoid

## Quick Start

1. **Read prerequisite skills** → Brand, positioning, and writing style
2. **Identify audience** → Track 1 (Commerce) or Track 2 (Platform)
3. **Select mode** → Light Mode (Track 1) or Dark Mode (Track 2)
4. **Use CommunicationOSHero** → The standard hero for all pages
5. **Compose sections** → Follow the section flow pattern
6. **Generate images** → Use nano-banana-agent MCP for section images
7. **Apply copy** → Use writing style skill for tone

## Track Selection

| Track | Audience | Mode | Content |
|-------|----------|------|---------|
| **Track 1: Commerce** | Commerce Leaders, Agencies | LIGHT | Sales pages, case studies |
| **Track 2: Platform** | Developers, Context Engineers | DARK | Technical deep-dives |

**Rule:** Light Mode = Commerce. Dark Mode = Platform. Never mix.

## Page Composition Pattern

1. HERO → Hook with value prop + CTA
2. PROBLEM → Why this matters (pain points)
3. SOLUTION → How we solve it (features)
4. PROOF → Evidence it works (social proof)
5. DETAILS → Deep dive (optional)
6. FAQ → Address objections
7. CTA → Final conversion push

## Section Mapping

| Stage | Track 1 (Light) | Track 2 (Dark) |
|-------|-----------------|----------------|
| Hero | CommunicationOSHero | CommunicationOSHero |
| Problem | FoundationFeatures | FoundationFeatures |
| Solution | Features, ThreeCards | MainFeatures |
| Proof | ConnectionsGrid | ProjectGrid |
| FAQ | FAQ | FAQ |
| CTA | FinalCTASimple | FinalCTA |

## Image Generation

1. Call GENERATE_IMAGE (nano-banana-agent) → get temporary URL
2. Call SAVE_ASSET_BY_URL (decocms-imagegen-mcp) → get permanent URL
3. Use permanent URL in page JSON`,
    references: [
      {
        name: "page-templates",
        path: "page-templates.md",
        content: `# Page Templates

## Template 1: Product Launch Page (Track 1 - Light)
**Sections:** Header → CommunicationOSHero → FoundationFeatures → Features → ConnectionsGrid → FAQ → FinalCTASimple → Footer

## Template 2: Technical Deep Dive (Track 2 - Mixed)
**Sections:** Header → CommunicationOSHero → MainFeatures → MCPMeshDeployAnywhere → MCPMeshHowItWorks → FAQ → FinalCTA → Footer

## Template 3: Feature Page (Track 1-2 - Mixed)
**Sections:** Header → CommunicationOSHero → FoundationFeatures → MCPMeshContextManagement → MCPMeshHowItWorks → FAQ → FinalCTAMCPMesh → Footer`,
      },
      {
        name: "section-catalog",
        path: "section-catalog.md",
        content: `# Section Catalog

| Section | Mode | Track | Best For |
|---------|------|-------|----------|
| CommunicationOSHero | Light | Both | Standard hero for all pages |
| BackboneSection | Light | 1 | Multi-product overviews |
| MainFeatures | Dark | 2 | Technical feature grids |
| Features | Light | 1 | Benefit-focused feature lists |
| ThreeCards | Light | 1 | Simple 3-feature highlights |
| FoundationFeatures | Light | Both | Problem/pain point framing |
| ConnectionsGrid | Light | 1 | Integration/partner logos |
| ProjectGrid | Dark | 2 | Portfolio/case studies |
| MCPMeshHowItWorks | Light | Both | Step-by-step explanations |
| MCPMeshDeployAnywhere | Dark | 2 | Deployment info |
| FAQ | Light | Both | Objection handling |
| FinalCTA | Lime | Both | Primary conversion |
| FinalCTASimple | Light | Both | Simple conversion |`,
      },
    ],
  },

  "deco-brand-guidelines": {
    id: "deco-brand-guidelines",
    name: "Deco Brand Guidelines",
    description:
      "Apply deco's visual identity and brand guidelines. Includes dual-track color system (Light Mode for Commerce, Dark Mode for Platform), typography, spacing, and accessibility standards.",
    mainContent: `# deco Brand Guidelines

## Core Concept: Dual-Track Visual Identity

| Track | Mode | Audience | Use For |
|-------|------|----------|---------|
| **Track 1: Commerce** | Light Mode | Commerce Leaders, Agencies | Website, sales decks, LinkedIn |
| **Track 2: Platform** | Dark Mode | Developers, Context Engineers | Technical docs, GitHub, Twitter/X |

**Rule:** Light Mode = Commerce. Dark Mode = Platform. Never mix.

## Brand Colors

- **Green (Primary):** #d0ec1a (light), #07401a (dark text)
- **Purple (Secondary):** #a595ff (light), #151042 (dark text)
- **Yellow (Tertiary):** #ffc116 (light), #392b02 (dark text)

## Mode Backgrounds

- **Light Mode (Track 1):** oklch(1 0 0) — white
- **Dark Mode (Track 2):** oklch(0.145 0 0) — near black

## Typography

- **Sans (primary):** System UI stack
- **Mono (code):** CommitMono or system mono
- **Type Scale:** Display (48-72px), H1 (36-48px), H2 (28-32px), Body (16px)

## Spacing & Radius

- **Base unit:** 4px (0.25rem)
- **Standard radius:** 6px (0.375rem)

## Logo & Naming

- **Company name:** \`deco\` (always lowercase)
- **Never:** "DECO", "Deco", "DecoCMS"
- **Product:** \`MCP Mesh\` (capital M, C, P, M)

## Brand Personality

| We Are | We Are Not |
|--------|------------|
| Considered, precise | Bloated, careless |
| Harmonious, cohesive | Choppy, disjointed |
| Honest, direct | Arrogant, evasive |
| Bold, creative | Reckless, try-hard |
| Constructive, building | Complaining, cynical |`,
    references: [
      {
        name: "color-tokens",
        path: "color-tokens.md",
        content: `# Color Tokens

## Light Mode Palette (Track 1)
| Token | Value |
|-------|-------|
| --background | oklch(1 0 0) |
| --foreground | oklch(0.19 0.01 107) |
| --primary | oklch(0.89 0.2 118) |
| --muted | oklch(0.97 0 107) |
| --border | oklch(0.91 0 107) |

## Dark Mode Palette (Track 2)
| Token | Value |
|-------|-------|
| --background | oklch(0.145 0 0) |
| --foreground | oklch(0.985 0 0) |
| --primary | oklch(0.922 0 0) |
| --muted | oklch(0.269 0 0) |
| --border | oklch(0.275 0 0) |`,
      },
      {
        name: "design-tokens",
        path: "design-tokens.md",
        content: `# Design Tokens

## Spacing Scale (base: 4px)
| Token | Value |
|-------|-------|
| --spacing-1 | 4px |
| --spacing-2 | 8px |
| --spacing-4 | 16px |
| --spacing-8 | 32px |
| --spacing-16 | 64px |

## Border Radius
| Token | Value |
|-------|-------|
| --radius-sm | 0.25rem |
| --radius-md | 0.375rem |
| --radius-lg | 0.5rem |
| --radius-full | 9999px |`,
      },
    ],
  },

  "deco-product-positioning": {
    id: "deco-product-positioning",
    name: "Deco Product Positioning",
    description:
      "Apply deco's dual-track product positioning strategy. Track 1 (Commerce/Outcomes) vs Track 2 (Platform/Authority), persona messaging, SEO strategy.",
    mainContent: `# deco Product Positioning

## The Dual-Track Framework

### Track 1: Commerce Outcomes
- **Content:** Website, Sales decks, Case studies
- **Social:** LinkedIn
- **Goal:** Close deals, prove ROI
- **Keywords:** Self-healing storefronts, Commerce Experience Agents

### Track 2: Platform Authority
- **Content:** Blog, Technical docs, Open-source
- **Social:** Twitter/X, Reddit, GitHub, Discord
- **Goal:** Build reputation, capture search
- **Keywords:** MCP Gateway, MCP Mesh, AI Platform

## Core Positioning

### One-Liner
> "The open-source AI OS for autonomous companies—proven with self-healing storefronts."

### Track 1 (Commerce)
> "Self-healing storefronts that fix what humans can't keep up with."

### Track 2 (Platform)
> "The MCP-native platform that runs AI at scale."

## Persona Quick Reference

| Persona | Track | CTA |
|---------|-------|-----|
| Commerce Leader | 1 | "Start Diagnostics" |
| Agency Partner | 1 | "Become a Partner" |
| Context Engineer | 2 | "Start Building" |
| Platform Leader | 2 | "See the Platform" |

## Reinforcement Mechanism

Every content connects both tracks:
- Commerce win → "powered by MCP Mesh architecture"
- Platform content → "proven with 100+ production stores"`,
    references: [
      {
        name: "persona-messaging",
        path: "persona-messaging.md",
        content: `# Persona Messaging

## Commerce Leader (Track 1)
**Pain:** Storefronts bleeding, reactive ops
**Value:** Agents ship fixes, not recommendations
**CTA:** "Start Diagnostics"

## Context Engineer (Track 2)
**Pain:** MCP chaos at 30+ servers
**Value:** Mesh solves tool selection at scale
**CTA:** "Start Building"`,
      },
      {
        name: "seo-keywords",
        path: "seo-keywords.md",
        content: `# SEO Keywords

## Track 1 (Commerce)
- ecommerce optimization agents
- self-healing storefront
- conversion rate optimization AI

## Track 2 (Platform)
- MCP Gateway
- MCP Mesh
- AI Platform
- Runlayer alternative
- Obot alternative`,
      },
    ],
  },

  "decocms-blog-posts": {
    id: "decocms-blog-posts",
    name: "DecoCMS Blog Posts",
    description:
      "Create structured blog posts using decoCMS's block-based content system. Use for blog posts, technical articles, announcements.",
    mainContent: `# Creating Blog Posts in decoCMS

## Critical: Blog Posts Use Blocks, Not Markdown

decoCMS blog posts use JSON with typed content blocks:

\`\`\`json
{
  "content": [
    { "type": "paragraph", "text": "First paragraph..." },
    { "type": "heading", "level": 2, "text": "Section Title" }
  ]
}
\`\`\`

**HTML is allowed:** \`<strong>\`, \`<em>\`, \`<a href="...">\`, \`<code>\`

## Post Structure

1. HOOK → Opening that captures attention
2. CONTEXT → Why this matters
3. THESIS → Main argument
4. EVIDENCE → Supporting details
5. CONCLUSION → Summary
6. CTA → What reader should do

## Block Types

### Narrative
- **paragraph** — Running text
- **heading** — Section headers (level 2-5)
- **blockquote** — Key quotes
- **list** — Bullet/numbered items

### Visual
- **stats** — Key metrics (2-4 numbers)
- **cardGrid** — Multi-column cards
- **comparison** — Before/after
- **steps** — Numbered process
- **checklist** — Features with checks

### CTAs
- **callout** — Important notes (info/warning/tip)
- **heroBox** — CTA box with buttons
- **buttonGroup** — Multiple links

## Common Examples

### paragraph
\`\`\`json
{ "type": "paragraph", "text": "Text with <strong>bold</strong>." }
\`\`\`

### stats
\`\`\`json
{ "type": "stats", "stats": [
  { "number": "55%", "label": "Faster" },
  { "number": "100+", "label": "Stores" }
]}
\`\`\`

### heroBox
\`\`\`json
{ "type": "heroBox", "title": "Get started", "buttons": [
  { "text": "Join Discord", "href": "...", "variant": "primary" }
]}
\`\`\``,
    references: [
      {
        name: "block-catalog",
        path: "block-catalog.md",
        content: `# Block Catalog

| Block | Purpose |
|-------|---------|
| paragraph | Running text |
| heading | Section headers |
| blockquote | Highlighted quotes |
| list | Bullet/numbered items |
| cardGrid | Multi-column cards (2-4) |
| comparison | Before/after |
| steps | Numbered process |
| stats | Key metrics |
| checklist | Feature checks |
| callout | Important notes |
| heroBox | CTA box |
| buttonGroup | Link group |
| image | Visual content |
| code | Code snippets |
| hr | Section divider |`,
      },
    ],
  },

  "deco-writing-style": {
    id: "deco-writing-style",
    name: "Deco Writing Style",
    description:
      "Apply deco's brand voice. Five pillars (Considered, Harmonious, Honest, Bold, Constructive), tone by persona, AI slop to avoid.",
    mainContent: `# deco Writing Style

## The Five Pillars

### 1. Considered
Every word earns its place. Remove filler. Choose precise words.

### 2. Harmonious
Ideas connect. Vary sentence length. Maintain consistent voice.

### 3. Honest
Speak directly. Own perspectives. Acknowledge limitations.

### 4. Bold
Stake out positions. Propose ambitious ideas. Include occasional wit.

### 5. Constructive
Build. Contribute. Focus on what we're creating, not competitors.

## Tone by Persona

### Track 1: Commerce
- Less technical
- Outcome-focused: "15% conversion lift"
- Reassuring

**Good:** "Your storefront is losing revenue every day. Our agents detect problems and fix them—while you sleep."

### Track 2: Platform
- More technical
- Peer-to-peer
- Detailed how/why

**Good:** "MCP at 30+ servers gets messy—context windows explode. Mesh handles this with progressive loading."

## Writing Mechanics

- **Concrete over abstract:** "Ships code" not "delivers solutions"
- **Specific over vague:** "47 fixes" not "many improvements"
- **Simple over fancy:** "Use" not "utilize"

## Key Terminology

| Term | Format |
|------|--------|
| deco | lowercase |
| MCP Mesh | Capital M, C, P, M |
| Self-heal loop | Hyphenate |
| Context Engineer | Capital C, E |`,
    references: [
      {
        name: "ai-slop-list",
        path: "ai-slop-list.md",
        content: `# AI Slop List — Avoid These

## Filler Phrases (cut entirely)
- "It's worth noting that..."
- "Importantly, ..."
- "At the end of the day..."
- "In order to..." → just "to"
- "When it comes to..."
- "Needless to say..."

## Overused AI Words
| Word | Alternative |
|------|-------------|
| Delve | Explore, examine |
| Foster | Build, create |
| Leverage | Use |
| Robust | Describe specifically |
| Seamless | Works well together |
| Cutting-edge | Describe what's new |
| Revolutionize | Describe the change |
| Ecosystem | Be specific |
| Empower | Show capability |

## Template Patterns to Avoid
- "Want X? We've got you covered."
- "This isn't about X. It's about Y."
- "X, and here's why."
- "The truth is..."
- "In a world where..."
- "Game-changer"
- "Unlock the power of..."`,
      },
      {
        name: "examples",
        path: "examples.md",
        content: `# Before & After Examples

## Generic AI → Our Voice

**Before:**
> "It's worth noting that leveraging cutting-edge AI can help foster robust outcomes."

**After:**
> "Storefronts are always bleeding. Our agents find issues first and fix them while you sleep."

## Over-Hedged → Direct

**Before:**
> "This could potentially help some teams achieve possibly better results."

**After:**
> "Teams see 15% better conversion. Here's how to know if it fits."

## Template → Bold

**Before:**
> "Want to transform your storefront? This isn't about monitoring. It's about action."

**After:**
> "Monitoring tells you there's a problem. We fix the problem. Automatically."`,
      },
    ],
  },
};

export const SKILL_IDS = Object.keys(SKILLS);
