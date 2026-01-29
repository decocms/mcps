/**
 * Blog MCP Resources
 *
 * Provides templates for creating tone of voice and visual style guides.
 * These are read-only templates that can be used as starting points.
 */

import { createPublicResource } from "@decocms/runtime";
import type { Env } from "../types/env.ts";

/**
 * Tone of Voice Template
 *
 * A comprehensive template for creating a tone of voice guide.
 * Based on the forensic analysis pattern from vibegui.com.
 */
const TONE_OF_VOICE_TEMPLATE = `# [Author Name]'s Tone of Voice: A Writing Guide

---

## CONTEXT

This document defines your unique writing voice. Use it as a reference when writing articles to maintain consistency across all content.

**Target audience**: AI agents, ghostwriters, or yourself when seeking consistency.

---

## SECTION 1: CORE IDENTITY

### 1.1 The Essence

[Describe how you write - are you conversational, formal, provocative, nurturing?]

**Primary archetype**: [e.g., "The Intellectual Warrior", "The Wise Friend", "The Skeptical Optimist"]

**Voice DNA**:
- [Trait 1: e.g., "Confessional without being self-indulgent"]
- [Trait 2: e.g., "Philosophical without being abstract"]
- [Trait 3: e.g., "Intense without being aggressive"]

### 1.2 The Person Behind the Words

[Brief bio that explains your perspective and why people should listen to you]

**Core tensions that create your unique voice**:
- [Tension 1: e.g., "Optimistic about the future / Honest about difficulties"]
- [Tension 2: e.g., "Deeply philosophical / Obsessively pragmatic"]

---

## SECTION 2: HOOK ARCHITECTURE

### Opening Patterns

Every first sentence should stop the scroll. Use these patterns:

#### Pattern 1: The Confession Hook
Start with radical vulnerability or counterintuitive admission.

> Example: "I spent 30 years desperately seeking recognition from others."

**Template**: "I [surprising admission about self]"

#### Pattern 2: The Philosophical Provocation
Challenge a widely-held assumption in the first line.

> Example: "The pessimist has the easiest job: they just need to wait for things to go wrong."

**Template**: "The [common thing] is actually [unexpected reframe]"

#### Pattern 3: The Story Seed
Begin with a concrete, specific moment.

> Example: "Yesterday I had the privilege of interviewing [Person]."

**Template**: "[Time marker] I [specific action] that [revealed insight]"

### Anti-Patterns (What NOT to do)
- ❌ "5 Tips for..." or "How to..." openings
- ❌ Questions that feel rhetorical or manipulative
- ❌ "In today's world..." (cliché setup)

---

## SECTION 3: STRUCTURAL BLUEPRINTS

### Short-Form (150-400 words)

\`\`\`
HOOK (1-2 sentences)
├── Confession/Provocation/Declaration
└── Creates immediate tension or curiosity

DEVELOPMENT (3-5 paragraphs)
├── Short paragraphs (often single sentences)
├── Builds argument through examples or story
└── Includes at least one moment of vulnerability

TURN/INSIGHT (1-2 sentences)
└── The "aha" that reframes everything

INVITATION/CLOSE (1-2 sentences)
├── Direct challenge to reader OR
├── Quote from philosophical influence OR
└── Simple, grounded statement
\`\`\`

### Long-Form (800-2000 words)

\`\`\`
OPENING ARC (10-15%)
├── Personal hook with immediate specificity
└── Sets emotional stakes

HONEST ASSESSMENT (25-30%)
├── What actually happened
├── What didn't work
└── No sugar-coating

LESSONS EXTRACTED (30-35%)
├── Section headers (brief, punchy)
└── Each lesson connects philosophy to practice

FORWARD LOOK (10-15%)
├── What this means for the future
└── Commitment statement
\`\`\`

---

## SECTION 4: VOCABULARY

### Words to Use Often
- [Word 1] - [when/why to use]
- [Word 2] - [when/why to use]
- [Word 3] - [when/why to use]

### Words to Avoid
- [Word 1] - [why to avoid, e.g., "corporate jargon"]
- [Word 2] - [why to avoid, e.g., "hedging language"]

---

## SECTION 5: EMOTIONAL REGISTER

Your emotional register sits at "[contained intensity / warm invitation / etc.]"

| Too Cold | Your Zone | Too Hot |
|----------|-----------|---------|
| "[cold example]" | "[your style example]" | "[overheated example]" |

---

## SECTION 6: CLOSE PATTERNS

### How to End Articles

**Type 1: The Direct Challenge**
> "You decide which result you want."

**Type 2: The Quiet Invitation**
> "My invitation for you: [specific action]."

**Type 3: The Philosophical Quote Close**
> "[Quote]" — [Author]

**Type 4: The Grounded Statement**
> "That feels like a good place to start."

---

## QUICK REFERENCE CHECKLIST

- [ ] Opening hook stops the scroll
- [ ] First-person voice throughout
- [ ] At least one vulnerable moment that's specific
- [ ] Short paragraphs (max 3 sentences)
- [ ] Active verbs ("I decided," not "It was decided")
- [ ] Ends with invitation or grounded statement
- [ ] No hedging language

---

*This guide should be updated as your voice evolves.*
`;

/**
 * Visual Style Template
 *
 * A template for creating a visual style guide for cover images.
 */
const VISUAL_STYLE_TEMPLATE = `# Visual Style Guide

## Overview

This document defines the visual language for all imagery. Use this when generating cover images for articles.

---

## Color Palette

| Role | Hex | Description |
|------|-----|-------------|
| **Background** | #XXXXXX | [Description - e.g., "Deep forest green - dark, grounding"] |
| **Accent** | #XXXXXX | [Description - e.g., "Bright lime - energetic, alive"] |
| **Mid-tones** | Interpolate between the two | For gradients and transitions |

**Rule**: [e.g., "Monochromatic palette ONLY. No other colors."]

---

## Aesthetic Style

**Core Aesthetic**: [e.g., "Retro Comic Hero meets Digital Noir"]

**Vibe**: [e.g., "Bold, heroic, retro-futuristic, gritty"]

### Style Influences
- [Influence 1: e.g., "1950s-60s Comic Books: Bold compositions, dramatic angles"]
- [Influence 2: e.g., "Atomic Age Sci-Fi: Ray guns, cosmic themes"]
- [Influence 3: e.g., "Digital Art: Glitch effects, pixelation"]

---

## Visual Effects (Required)

- **[Effect 1]**: [e.g., "Heavy dithering patterns throughout"]
- **[Effect 2]**: [e.g., "Halftone dots like vintage printing"]
- **[Effect 3]**: [e.g., "Film grain texture overlay"]

### Composition Style
- [e.g., "Bold, dramatic compositions"]
- [e.g., "Strong contrast between dark and bright areas"]
- [e.g., "Hero shots - subjects presented powerfully"]

---

## Image Generation Prompt Template

Use this as a base prompt:

\`\`\`
Create a digital artwork with [background color description].

[DESCRIBE THE MAIN SUBJECT OR CONCEPT HERE]

Style influences: [list your style influences].

Apply effects: [list required effects].

Bold dramatic composition with strong contrast. [Accent color] for highlights and glowing elements.

[Color palette rule].

[Overall vibe description].

[Dimensions: e.g., "1200x630 landscape"]
\`\`\`

---

## Example Prompts

### Article Header (1200x630)
\`\`\`
Create a landscape digital artwork (1200x630) with [background].

[CONCEPT] depicted in [style]. Bold, heroic composition.

[Effects]. [Accent color] for highlights.

[Color rule]. No text.

Style: [style description].
\`\`\`

### Square Social Post (1080x1080)
\`\`\`
Create a square digital artwork (1080x1080) with [background].

[CONCEPT] in [style]. Dynamic pose or dramatic composition.

[Effects].

[Accent color] accents against [background].

[Color rule]. [Vibe].
\`\`\`

---

## What to Avoid

- ❌ [e.g., "Other colors outside the palette"]
- ❌ [e.g., "Clean, smooth gradients (use effects instead)"]
- ❌ [e.g., "Photorealistic imagery"]
- ❌ [e.g., "Text overlays (add text separately)"]
- ❌ [e.g., "Generic stock photo aesthetics"]

---

## Conceptual Adaptations

When representing different concepts, adapt the style:

| Concept | Visual Treatment |
|---------|-----------------|
| **Technology** | [e.g., "Robot heroes, circuit patterns"] |
| **Leadership** | [e.g., "Heroic silhouette, upward angle"] |
| **Growth** | [e.g., "Ascending figure, explosive energy"] |
| **Philosophy** | [e.g., "Contemplative pose, cosmic background"] |
| **Writing** | [e.g., "Typewriter keys, speech bubbles"] |

---

## Technical Specs

| Use Case | Dimensions | Format |
|----------|------------|--------|
| Article Header / OG Image | 1200x630 | PNG |
| Square Social Post | 1080x1080 | PNG |
| Story/Vertical | 1080x1920 | PNG |
| Favicon/Icon | 512x512 | PNG |

---

*Update this guide as your visual identity evolves.*
`;

/**
 * Create tone of voice template resource
 */
export const createToneOfVoiceTemplateResource = (_env: Env) =>
  createPublicResource({
    uri: "resource://tone-of-voice-template",
    name: "Tone of Voice Template",
    description:
      "A comprehensive template for creating a tone of voice writing guide. Use this as a starting point when running TONE_OF_VOICE_TEMPLATE prompt.",
    mimeType: "text/markdown",
    read: () => ({
      uri: "resource://tone-of-voice-template",
      mimeType: "text/markdown",
      text: TONE_OF_VOICE_TEMPLATE,
    }),
  });

/**
 * Create visual style template resource
 */
export const createVisualStyleTemplateResource = (_env: Env) =>
  createPublicResource({
    uri: "resource://visual-style-template",
    name: "Visual Style Template",
    description:
      "A template for creating a visual style guide for cover images. Use this as a starting point when running VISUAL_STYLE_TEMPLATE prompt.",
    mimeType: "text/markdown",
    read: () => ({
      uri: "resource://visual-style-template",
      mimeType: "text/markdown",
      text: VISUAL_STYLE_TEMPLATE,
    }),
  });

/**
 * All resource factory functions.
 */
export const resources = [
  createToneOfVoiceTemplateResource,
  createVisualStyleTemplateResource,
];
