/**
 * Blog MCP Prompts
 *
 * These prompts guide the workflow for writing blog articles with consistent
 * tone of voice and visual style.
 *
 * ## File Structure
 *
 * project/
 * ├── blog/                      # Blog configuration
 * │   ├── tone-of-voice.md       # Writing style guide
 * │   ├── visual-style.md        # Image generation style guide
 * │   └── config.json            # Optional: default tags, author info
 * └── data/
 *     └── articles/              # Article markdown files
 *         ├── my-first-post.md
 *         └── another-article.md
 *
 * ## Workflow
 *
 * 1. SETUP_PROJECT - Initialize blog structure (one-time)
 * 2. TONE_OF_VOICE_TEMPLATE - Create tone of voice guide
 * 3. VISUAL_STYLE_TEMPLATE - Create visual style guide
 * 4. WRITE_ARTICLE - Write new articles
 * 5. EDIT_ARTICLE - Edit existing articles
 */

import { createPrompt, type GetPromptResult } from "@decocms/runtime";
import { z } from "zod";
import type { Env } from "./types/env.ts";

/**
 * SETUP_PROJECT - Initialize blog structure in a project
 */
export const createSetupProjectPrompt = (_env: Env) =>
  createPrompt({
    name: "SETUP_PROJECT",
    title: "Setup Blog Project",
    description: `Initialize a blog project structure with configuration folders.

This is the FIRST step for a new blog. Creates:
- blog/ folder for configuration
- blog/articles/ folder for article markdown files

After setup, use TONE_OF_VOICE_TEMPLATE and VISUAL_STYLE_TEMPLATE to create style guides.`,
    argsSchema: {
      projectPath: z
        .string()
        .optional()
        .describe("Project root path (default: current directory)"),
    },
    execute: ({ args }): GetPromptResult => {
      const projectPath = args.projectPath || ".";

      return {
        description: "Initialize blog project structure",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `# Setup Blog Project

## Task
Initialize the blog structure in: ${projectPath}

## Step 1: Create directories

\`\`\`bash
mkdir -p ${projectPath}/blog
mkdir -p ${projectPath}/blog/articles
\`\`\`

## Step 2: Create placeholder config

Write to \`${projectPath}/blog/config.json\`:
\`\`\`json
{
  "author": "Your Name",
  "defaultTags": [],
  "imageStyle": "blog/visual-style.md"
}
\`\`\`

## Step 3: Verify structure

\`\`\`bash
ls -la ${projectPath}/blog/
ls -la ${projectPath}/blog/articles/
\`\`\`

## Next Steps

Tell the user:
"✓ Blog structure created!

Next, let's set up your writing style:
1. Run **TONE_OF_VOICE_TEMPLATE** to create your unique writing voice
2. Run **VISUAL_STYLE_TEMPLATE** to define your visual style for cover images

Would you like to start with the tone of voice guide?"`,
            },
          },
        ],
      };
    },
  });

/**
 * TONE_OF_VOICE_TEMPLATE - Guide for creating tone of voice
 */
export const createToneOfVoicePrompt = (_env: Env) =>
  createPrompt({
    name: "TONE_OF_VOICE_TEMPLATE",
    title: "Create Tone of Voice Guide",
    description: `Create a comprehensive tone of voice guide for writing articles.

This prompt helps extract your unique writing voice by:
1. Analyzing existing content (if available)
2. Asking key questions about your style
3. Generating a detailed writing guide

The guide is saved to blog/tone-of-voice.md and referenced when writing articles.`,
    argsSchema: {
      existingContent: z
        .string()
        .optional()
        .describe("URLs or paths to existing articles to analyze"),
      authorName: z.string().optional().describe("Author name for the guide"),
      projectPath: z
        .string()
        .optional()
        .describe("Project root path (default: current directory)"),
    },
    execute: ({ args }): GetPromptResult => {
      const projectPath = args.projectPath || ".";
      const authorName = args.authorName || "the author";

      return {
        description: `Create tone of voice guide for ${authorName}`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `# Create Tone of Voice Guide

## Goal
Create a comprehensive tone of voice guide for ${authorName} and save it to:
\`${projectPath}/blog/tone-of-voice.md\`

${
  args.existingContent
    ? `## Analyze Existing Content

First, read and analyze these sources:
${args.existingContent}

Extract patterns for:
- Hook styles (how articles open)
- Sentence rhythm (short vs long)
- Vocabulary preferences
- Emotional register
- Signature phrases
`
    : ""
}

## Interview Questions

Ask the user these questions to understand their voice:

### 1. Core Identity
- "How would you describe your writing in 3 words?"
- "Who are you writing for? (audience)"
- "What makes your perspective unique?"

### 2. Style Preferences
- "Do you prefer formal or conversational tone?"
- "Short punchy sentences or longer explanatory ones?"
- "Do you use first person (I) or avoid it?"

### 3. Influences
- "Which writers or thinkers influence you?"
- "Any books or philosophies that shape your worldview?"

### 4. Emotional Register
- "How vulnerable do you get in writing?"
- "Do you use humor? What kind?"
- "How do you handle disagreement or controversy?"

## Guide Structure

After gathering info, create a markdown file with these sections:

\`\`\`markdown
# [Author Name]'s Tone of Voice Guide

## Core Identity
[Who they are as a writer, primary archetype]

## Voice DNA
- [Key trait 1]
- [Key trait 2]
- [Key trait 3]

## Hook Patterns
[How to open articles - with examples]

## Sentence Rhythm
[Short vs long, paragraph structure]

## Vocabulary
### Words to use:
- [word 1] - [when/why]
- [word 2] - [when/why]

### Words to avoid:
- [word 1] - [why]
- [word 2] - [why]

## Emotional Register
[How much vulnerability, intensity level]

## Philosophical Framework
[Key influences, worldview]

## Implementation Checklist
- [ ] Opening hook stops the scroll
- [ ] At least one vulnerable moment
- [ ] Connects philosophy to practice
- [ ] Ends with invitation or grounded statement

## Quick Reference
\`\`\`
ESSENCE: [One-line summary]
HOOKS: [Types of openings]
RHYTHM: [Sentence style]
CLOSE: [How to end]
AVOID: [What not to do]
\`\`\`
\`\`\`

## Save the Guide

Write the completed guide to:
\`${projectPath}/blog/tone-of-voice.md\`

## Completion

Tell the user:
"✓ Tone of voice guide saved to blog/tone-of-voice.md

I'll reference this guide when writing articles. You can edit it anytime to refine your voice.

Would you like to create a visual style guide for cover images next?"`,
            },
          },
        ],
      };
    },
  });

/**
 * VISUAL_STYLE_TEMPLATE - Guide for creating visual style
 */
export const createVisualStylePrompt = (_env: Env) =>
  createPrompt({
    name: "VISUAL_STYLE_TEMPLATE",
    title: "Create Visual Style Guide",
    description: `Create a visual style guide for generating cover images.

This guide defines:
- Color palette
- Aesthetic style (retro, modern, minimalist, etc.)
- Image effects (dithering, gradients, etc.)
- Prompt templates for image generation

The guide is saved to blog/visual-style.md and used by COVER_IMAGE_GENERATE.`,
    argsSchema: {
      aesthetic: z
        .string()
        .optional()
        .describe("Desired aesthetic (e.g., 'retro comic', 'minimalist')"),
      primaryColor: z
        .string()
        .optional()
        .describe("Primary brand color (hex, e.g., '#1a4d3e')"),
      accentColor: z
        .string()
        .optional()
        .describe("Accent color (hex, e.g., '#c4e538')"),
      projectPath: z
        .string()
        .optional()
        .describe("Project root path (default: current directory)"),
    },
    execute: ({ args }): GetPromptResult => {
      const projectPath = args.projectPath || ".";

      return {
        description: "Create visual style guide for cover images",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `# Create Visual Style Guide

## Goal
Create a visual style guide for cover images and save it to:
\`${projectPath}/blog/visual-style.md\`

## Questions to Ask

### 1. Color Palette
${
  args.primaryColor
    ? `- Primary color provided: ${args.primaryColor}`
    : '- "What is your primary/background color?"'
}
${
  args.accentColor
    ? `- Accent color provided: ${args.accentColor}`
    : '- "What is your accent/highlight color?"'
}
- "Should images be monochromatic or use multiple colors?"

### 2. Aesthetic Style
${
  args.aesthetic
    ? `- Aesthetic provided: ${args.aesthetic}`
    : `- "What visual style do you prefer?"
  Examples:
  - Retro 1950s comic book
  - Modern minimalist
  - Cyberpunk/neon
  - Watercolor illustration
  - Abstract geometric
  - Photography-based`
}

### 3. Effects & Textures
- "Any specific effects? (dithering, gradients, grain, halftone)"
- "Flat design or textured?"

### 4. Subjects & Imagery
- "What kind of subjects? (abstract, people, objects, scenes)"
- "Any imagery to avoid?"

## Guide Structure

Create a markdown file with:

\`\`\`markdown
# Visual Style Guide

## Overview
[Brief description of the visual identity]

## Color Palette

| Role | Hex | Description |
|------|-----|-------------|
| Background | #XXXXXX | [description] |
| Accent | #XXXXXX | [description] |

## Aesthetic Style
[Description of the style, influences, references]

## Visual Elements
### Style Influences
- [Influence 1]
- [Influence 2]

### Required Effects
- [Effect 1: e.g., "heavy dithering"]
- [Effect 2: e.g., "halftone dots"]

### Composition
- [Guidance on composition]

## Image Generation Prompt Template

\`\`\`
[Base prompt template with placeholders for CONCEPT, DIMENSIONS]
\`\`\`

## Example Prompts

### Article Header (1200x630)
\`\`\`
[Complete example prompt]
\`\`\`

### Square Social (1080x1080)
\`\`\`
[Complete example prompt]
\`\`\`

## What to Avoid
- ❌ [Thing to avoid 1]
- ❌ [Thing to avoid 2]

## Concept Adaptations

| Concept | Visual Treatment |
|---------|-----------------|
| Technology | [How to represent] |
| Leadership | [How to represent] |
| Growth | [How to represent] |
\`\`\`

## Save the Guide

Write the completed guide to:
\`${projectPath}/blog/visual-style.md\`

## Completion

Tell the user:
"✓ Visual style guide saved to blog/visual-style.md

When generating cover images with COVER_IMAGE_GENERATE, I'll use these guidelines.

Your blog setup is complete! You can now write articles with WRITE_ARTICLE."`,
            },
          },
        ],
      };
    },
  });

/**
 * WRITE_ARTICLE - Workflow for writing a new article
 */
export const createWriteArticlePrompt = (_env: Env) =>
  createPrompt({
    name: "WRITE_ARTICLE",
    title: "Write New Article",
    description: `Workflow for writing a new blog article.

This prompt:
1. Instructs the agent to read blog/tone-of-voice.md first
2. Provides article structure guidelines
3. Shows the frontmatter format
4. Guides saving to blog/articles/{slug}.md`,
    argsSchema: {
      topic: z.string().describe("Topic or title of the article"),
      notes: z
        .string()
        .optional()
        .describe("Notes, outline, or key points to cover"),
      projectPath: z
        .string()
        .optional()
        .describe("Project root path (default: current directory)"),
    },
    execute: ({ args }): GetPromptResult => {
      const projectPath = args.projectPath || ".";
      const { topic, notes } = args;

      return {
        description: `Write article about: ${topic}`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `# Write New Article: ${topic}

## Step 1: Read Tone of Voice Guide

**IMPORTANT**: Before writing, read the tone of voice guide:
\`${projectPath}/blog/tone-of-voice.md\`

Apply these guidelines throughout the article.

## Step 2: Plan the Article

${
  notes
    ? `### Notes Provided:
${notes}
`
    : ""
}

### Article Structure (from tone guide):
1. **Hook** (1-2 sentences) - Stop the scroll
2. **Development** (3-5 paragraphs) - Build the argument
3. **Turn/Insight** (1-2 sentences) - The "aha" moment
4. **Close** (1-2 sentences) - Challenge, quote, or grounded statement

## Step 3: Generate Slug

Convert the title to a URL-friendly slug:
- Lowercase
- Replace spaces with hyphens
- Remove special characters
- Keep it concise

Example: "Why I Love Mondays" → "why-i-love-mondays"

## Step 4: Write the Article

Create the article with YAML frontmatter:

\`\`\`markdown
---
slug: [generated-slug]
title: "${topic}"
description: "[1-2 sentence description for SEO]"
date: [today's date YYYY-MM-DD]
status: draft
coverImage: null
tags:
  - [tag1]
  - [tag2]
---

[Article content following the structure above]
\`\`\`

## Step 5: Save the Article

Write to: \`${projectPath}/blog/articles/{slug}.md\`

## Step 6: Review with User

Show the article to the user and ask:
"Here's the draft. Would you like me to:
1. Edit any sections?
2. Adjust the tone?
3. Generate a cover image?
4. Publish it (change status to 'published')?"

## Checklist (from tone guide)
- [ ] Opening hook stops the scroll
- [ ] At least one vulnerable moment (if appropriate)
- [ ] Short paragraphs (max 3 sentences)
- [ ] Connects to action, not just contemplation
- [ ] Ends with invitation or grounded statement`,
            },
          },
        ],
      };
    },
  });

/**
 * EDIT_ARTICLE - Workflow for editing an existing article
 */
export const createEditArticlePrompt = (_env: Env) =>
  createPrompt({
    name: "EDIT_ARTICLE",
    title: "Edit Existing Article",
    description: `Workflow for editing an existing blog article.

Provides guidance on:
- Reading the current article
- Piecemeal editing techniques
- Maintaining consistent voice`,
    argsSchema: {
      slug: z.string().describe("Article slug (filename without .md)"),
      editRequest: z
        .string()
        .optional()
        .describe("Specific edit request from user"),
      projectPath: z
        .string()
        .optional()
        .describe("Project root path (default: current directory)"),
    },
    execute: ({ args }): GetPromptResult => {
      const projectPath = args.projectPath || ".";
      const { slug, editRequest } = args;

      return {
        description: `Edit article: ${slug}`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `# Edit Article: ${slug}

## Step 1: Read Current Article

Read: \`${projectPath}/blog/articles/${slug}.md\`

## Step 2: Read Tone of Voice Guide

To maintain consistency, also read:
\`${projectPath}/blog/tone-of-voice.md\`

${
  editRequest
    ? `## Edit Request

The user wants:
${editRequest}
`
    : ""
}

## Editing Techniques

### For Small Changes
Use precise text replacement:
- Find the exact text to change
- Replace with new text
- Preserve surrounding context

### For Structural Changes
- Maintain the Hook → Develop → Turn → Close structure
- Keep paragraph rhythm consistent
- Preserve the author's voice

### For Tone Adjustments
Reference the tone guide for:
- Vocabulary preferences
- Sentence rhythm
- Emotional register

## Step 3: Make Edits

Edit the file at: \`${projectPath}/blog/articles/${slug}.md\`

Update the frontmatter if needed:
- Update \`date\` if content changes significantly
- Keep \`slug\` unchanged (breaks URLs)

## Step 4: Show Changes

Tell the user what was changed:
"I made the following edits to '${slug}':
- [Change 1]
- [Change 2]

Would you like any additional changes?"`,
            },
          },
        ],
      };
    },
  });

/**
 * All prompt factory functions.
 */
export const prompts = [
  createSetupProjectPrompt,
  createToneOfVoicePrompt,
  createVisualStylePrompt,
  createWriteArticlePrompt,
  createEditArticlePrompt,
];
