# Blog MCP

AI-powered blog writing assistant with tone of voice and visual style guides.

## Overview

The Blog MCP helps AI agents write blog articles with consistent voice and style. It provides:

- **Prompts** for setting up blogs, creating style guides, and writing articles
- **Tools** for generating cover images and validating article structure
- **Resources** with templates for tone of voice and visual style guides

## Key Concept

Articles are stored as **markdown files with YAML frontmatter** in the git repository. The MCP guides the workflow - the agent reads/writes files directly. This enables:

- Git-based version control for all content
- Easy integration with static site generators
- Future compatibility with deco.cx git-based editor

## File Structure

```
project/
└── blog/                      # Blog folder
    ├── tone-of-voice.md       # Writing style guide
    ├── visual-style.md        # Image generation style guide
    ├── config.json            # Optional: default tags, author info
    └── articles/              # Article markdown files
        ├── my-first-post.md
        └── another-article.md
```

## Article Format

Each article is a markdown file with YAML frontmatter:

```markdown
---
slug: my-first-post
title: "My First Post"
description: "A brief description for SEO"
date: 2025-01-27
status: draft
coverImage: /images/articles/my-first-post.png
tags:
  - technology
  - writing
---

Article content in markdown...
```

## Prompts

| Prompt | Description |
|--------|-------------|
| `SETUP_PROJECT` | Initialize blog structure (blog/, blog/articles/) |
| `TONE_OF_VOICE_TEMPLATE` | Create a writing style guide |
| `VISUAL_STYLE_TEMPLATE` | Create a visual style guide for images |
| `WRITE_ARTICLE` | Workflow for writing new articles |
| `EDIT_ARTICLE` | Workflow for editing existing articles |

## Tools

### Helpers

| Tool | Description |
|------|-------------|
| `COVER_IMAGE_GENERATE` | Generate cover image using IMAGE_GENERATOR binding |
| `ARTICLE_FRONTMATTER` | Generate valid YAML frontmatter for an article |
| `ARTICLE_VALIDATE` | Validate article structure and frontmatter |

### Filesystem (requires LOCAL_FS binding)

| Tool | Description |
|------|-------------|
| `BLOG_READ_STYLE_GUIDE` | Read tone-of-voice.md or visual-style.md |
| `BLOG_LIST_ARTICLES` | List all articles in blog/articles/ |
| `BLOG_READ_ARTICLE` | Read an article by slug |
| `BLOG_WRITE_ARTICLE` | Write/create an article |
| `BLOG_DELETE_ARTICLE` | Delete an article |

## Resources

| Resource | Description |
|----------|-------------|
| `resource://tone-of-voice-template` | Template for creating tone of voice guides |
| `resource://visual-style-template` | Template for creating visual style guides |

## Bindings

| Binding | Required | Description |
|---------|----------|-------------|
| `LOCAL_FS` | Optional | Local filesystem - select a folder with a `blog/` subfolder |
| `IMAGE_GENERATOR` | Optional | Image generation (nanobanana) for cover images |

When `LOCAL_FS` is connected, the blog MCP becomes fully self-contained and can read/write articles directly.

## Quick Start

1. **Setup project**: Run `SETUP_PROJECT` prompt
2. **Create tone of voice**: Run `TONE_OF_VOICE_TEMPLATE` prompt
3. **Create visual style**: Run `VISUAL_STYLE_TEMPLATE` prompt
4. **Write articles**: Run `WRITE_ARTICLE` prompt

## Development

```bash
# Install dependencies
bun install

# Run locally
bun run dev

# Type check
bun run check

# Build for production
bun run build
```

## License

MIT
