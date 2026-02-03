/**
 * Blog Posts Skill
 *
 * Comprehensive guide for creating weekly digest articles for decoNews
 * using the deco_weekly_report database format.
 */

export const BLOG_POSTS_SKILL = `---
name: deconews-weekly-digest-posts
description: Create weekly digest articles for decoNews using the database format. Use when writing curated digest posts, news summaries, and weekly roundups for deco.news.
---

# Creating Weekly Digest Articles for decoNews

Create polished weekly digest articles for decoNews. Articles are stored in the \`deco_weekly_report\` database table and managed through the Weekly Digest MCP tools.

## Quick Start

1. **Gather content** → Use content-scraper MCP to fetch this week's content
2. **Identify themes** → Group content by 3-5 main themes
3. **Write content** → Curate and summarize (not opinion pieces)
4. **Use the right tool** → Call \`SAVE_WEEKLY_DIGEST_ARTICLE\` to save

## Article Database Schema

Articles are stored with the following fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`url\` | string | ✓ | Unique URL for the article |
| \`title\` | string | ✓ | Article title |
| \`source_title\` | string | | Original source/publication name |
| \`status\` | enum | ✓ | Article status (see below) |
| \`content\` | string | | Full article content (HTML allowed) |
| \`slug\` | string | | URL-friendly slug (auto-generated from title if not provided) |
| \`summary\` | string | | Brief 1-2 sentence summary |
| \`key_points\` | string | | Key points (JSON array or comma-separated) |
| \`meta_title\` | string | | SEO title |
| \`meta_description\` | string | | SEO description (150-160 chars) |
| \`keywords\` | string | | SEO keywords (comma-separated) |
| \`category\` | enum | | Article category (see below) |
| \`tags\` | string | | Article tags (comma-separated) |
| \`author\` | string | | Author name |
| \`reading_time\` | number | | Estimated reading time in minutes |
| \`published_at\` | string | | Publication date (ISO 8601) |
| \`image_url\` | string | | Main image URL |
| \`image_alt_text\` | string | | Alt text for the main image |

### Status Values

| Status | When to Use |
|--------|-------------|
| \`draft\` | Initial creation, still being written |
| \`pending_review\` | Ready for editorial review |
| \`approved\` | Reviewed and approved for publishing |
| \`published\` | Live on decoNews |
| \`archived\` | No longer active/visible |

### Category Values

- \`AI & Machine Learning\`
- \`eCommerce\`
- \`Developer Tools\`
- \`Platform Updates\`
- \`Community\`
- \`Tutorials\`
- \`Case Studies\`
- \`Industry News\`

## Content Format

The \`content\` field accepts **HTML**. Use standard HTML tags for formatting:

\`\`\`html
<h2>Section Title</h2>
<p>Regular paragraph with <strong>bold</strong> and <em>italic</em> text.</p>
<p>Links use: <a href="https://example.com">link text</a></p>

<h3>Subsection</h3>
<ul>
  <li>Bullet point one</li>
  <li>Bullet point two</li>
</ul>

<ol>
  <li>Numbered item one</li>
  <li>Numbered item two</li>
</ol>

<blockquote>Important quote or highlight</blockquote>

<pre><code>Code snippet here</code></pre>
\`\`\`

### Allowed HTML Tags

- **Headings:** \`<h2>\`, \`<h3>\`, \`<h4>\`
- **Text:** \`<p>\`, \`<strong>\`, \`<em>\`, \`<code>\`, \`<br>\`
- **Links:** \`<a href="...">\`
- **Lists:** \`<ul>\`, \`<ol>\`, \`<li>\`
- **Quotes:** \`<blockquote>\`
- **Code:** \`<pre>\`, \`<code>\`
- **Media:** \`<img src="..." alt="...">\`
- **Dividers:** \`<hr>\`

## Weekly Digest Structure

Weekly digests follow this structure:

\`\`\`
1. INTRO           → Brief intro, week number, preview of themes
2. HIGHLIGHTS      → Top 2-3 items (highest post_score from scraper)
3. THEMED SECTIONS → 3-5 sections grouped by topic
4. COMMUNITY       → Notable quotes/posts from LinkedIn, Reddit, Twitter
5. CLOSING         → Wrap-up and call to action
\`\`\`

### Example Content Structure

\`\`\`html
<p>Welcome to Week 5 of 2026! This week we're covering advances in AI tooling, new MCP integrations, and community highlights.</p>

<hr>

<h2>🔥 Highlights</h2>

<h3>Major MCP Update Released</h3>
<p>Summary of the highlight with <a href="https://source.com">source link</a>.</p>

<h3>AI Agent Breakthroughs</h3>
<p>Another major highlight summary.</p>

<hr>

<h2>AI & Machine Learning</h2>

<p>This week in AI...</p>

<ul>
  <li><strong>Article Title</strong> — Brief summary. <a href="https://source.com">Read more</a></li>
  <li><strong>Another Article</strong> — Brief summary. <a href="https://source.com">Read more</a></li>
</ul>

<hr>

<h2>Developer Tools</h2>

<p>New tools and updates...</p>

<ul>
  <li><strong>Tool Name</strong> — What it does. <a href="https://github.com/...">GitHub</a></li>
</ul>

<hr>

<h2>Community Voices</h2>

<blockquote>
"Interesting quote from the community" — @username on Twitter
</blockquote>

<p>Discussion highlights from Reddit and LinkedIn...</p>

<hr>

<h2>That's a Wrap!</h2>

<p>Thanks for reading this week's digest. Got something we should cover? <a href="https://discord.gg/deco">Join our Discord</a>.</p>
\`\`\`

## Using the MCP Tools

### Saving a New Article

Use \`SAVE_WEEKLY_DIGEST_ARTICLE\`:

\`\`\`json
{
  "url": "https://deco.news/weekly-digest-2026-w05",
  "title": "Weekly Digest: AI Agents and MCP Updates",
  "status": "draft",
  "content": "<p>Full HTML content here...</p>",
  "summary": "This week's roundup covers AI agent breakthroughs, new MCP integrations, and community highlights.",
  "key_points": "AI agents, MCP updates, community highlights",
  "category": "Industry News",
  "tags": "weekly-digest, ai, mcp, community",
  "author": "decoNews Team",
  "reading_time": 5,
  "image_url": "https://assets.decocache.com/...",
  "image_alt_text": "Weekly Digest Week 5 2026",
  "meta_title": "Weekly Digest Week 5 | decoNews",
  "meta_description": "AI agent breakthroughs, MCP updates, and community highlights in this week's decoNews digest."
}
\`\`\`

### Listing Articles

Use \`LIST_WEEKLY_DIGEST\`:

\`\`\`json
{
  "limit": 10,
  "status": "draft",
  "category": "Industry News",
  "orderBy": "created_at",
  "orderDirection": "desc"
}
\`\`\`

### Updating an Article

Use \`UPDATE_WEEKLY_DIGEST_ARTICLE\`:

\`\`\`json
{
  "url": "https://deco.news/weekly-digest-2026-w05",
  "updates": {
    "status": "pending_review",
    "content": "<p>Updated content...</p>"
  }
}
\`\`\`

### Publishing an Article

Use \`PUBLISH_WEEKLY_DIGEST_ARTICLE\`:

\`\`\`json
{
  "url": "https://deco.news/weekly-digest-2026-w05"
}
\`\`\`

This sets \`status\` to "published" and \`published_at\` to current timestamp.

## Weekly Digest Workflow

1. **Fetch content** → Use \`LIST_SCRAPED_CONTENT\` from content-scraper MCP with \`currentWeekOnly: true\`
2. **Analyze themes** → Group content by topic, prioritize by \`post_score\`
3. **Draft article** → Write HTML content following the structure above
4. **Save draft** → Call \`SAVE_WEEKLY_DIGEST_ARTICLE\` with \`status: "draft"\`
5. **Review & update** → Use \`UPDATE_WEEKLY_DIGEST_ARTICLE\` to refine
6. **Publish** → Call \`PUBLISH_WEEKLY_DIGEST_ARTICLE\` when ready

## Tone & Voice Guidelines

Weekly digests are **informative and curated**, not opinion pieces:

### DO
- Summarize what happened (neutral, factual)
- Credit original sources with links
- Use "here's what we found interesting" framing
- Highlight key insights without editorializing
- Keep it scannable with clear sections

### DON'T
- Give personal opinions on the content
- Use AI slop words (revolutionary, groundbreaking, cutting-edge)
- Write walls of text without structure
- Forget to link to original sources
- Overuse emojis (1-2 per section max)

## URL & Slug Conventions

### Weekly Digest URL Pattern
\`\`\`
https://deco.news/weekly-digest-YYYY-wWW
\`\`\`

Examples:
- \`https://deco.news/weekly-digest-2026-w05\`
- \`https://deco.news/weekly-digest-2026-w06\`

### Slug Pattern
\`\`\`
weekly-digest-YYYY-wWW
\`\`\`

The slug is auto-generated from title if not provided, but for weekly digests, use the standard pattern.

## Title Patterns

Use one of these formats for weekly digest titles:

- "Weekly Digest: [Main Theme] and more"
- "This Week in [Topic]: [Highlight]"
- "Weekly Digest — Week XX/YYYY"
- "Week XX: [Theme 1], [Theme 2], and [Theme 3]"

Examples:
- "Weekly Digest: AI Agents Take Center Stage"
- "This Week in MCP: New Integrations and Community Growth"
- "Week 5: Context Engineering, MCP Mesh, and Community Highlights"

## Image Generation

For weekly digest images, generate using the **nano-banana-agent** MCP:

### Generate Image
\`\`\`json
{
  "prompt": "MODE A — ABSTRACT. Pure abstract composition representing weekly news digest. Stacked geometric shapes suggesting aggregated content, thin lines connecting different blocks. High contrast, minimal elements.\\n\\nSTYLE: risograph print, 2-color duotone poster, brutalist modernism, high contrast, hard edges\\n\\nPALETTE: background #D0EC1A, ink #07401A, strictly 2 colors only\\n\\nAVOID: no text, no labels, no gradients, no photoreal",
  "model": "gemini-3-pro-image-preview",
  "aspectRatio": "16:9"
}
\`\`\`

### Save Image Permanently
After generating, save using \`SAVE_ASSET_BY_URL\`:
\`\`\`json
{
  "url": "https://temporary-url-from-generate...",
  "sitename": "deconews",
  "filename": "weekly-digest-2026-w05-cover.png"
}
\`\`\`

Use the permanent URL in \`image_url\` field.

## Common Mistakes

- **Forgetting source links:** Always link back to original content
- **Opinion instead of curation:** Weekly digests summarize, not editorialize
- **Missing key_points:** Include comma-separated key topics for search
- **Wrong status:** Start with "draft", move to "pending_review", then publish
- **No slug:** Let it auto-generate or use \`weekly-digest-YYYY-wWW\` pattern
- **Expired image URLs:** Always save images permanently before using
- **Walls of text:** Use headings, lists, and \`<hr>\` for scannability

## Author Default

For weekly digests, use:
- **Author:** \`decoNews Team\` or \`deco.news\`

## Complete Example

\`\`\`json
{
  "url": "https://deco.news/weekly-digest-2026-w05",
  "title": "Weekly Digest: Context Engineering Takes Center Stage",
  "source_title": "decoNews Weekly",
  "status": "draft",
  "content": "<p>Welcome to Week 5 of 2026! This week we're diving into context engineering breakthroughs, new MCP tools, and what the community is building.</p><hr><h2>🔥 Top Highlights</h2><h3>Context Engineering Goes Mainstream</h3><p>The conversation around context engineering hit critical mass this week, with multiple thought leaders weighing in on how AI context management is becoming a core engineering discipline. <a href=\\"https://example.com/article\\">Read the full analysis</a></p><hr><h2>Developer Tools</h2><ul><li><strong>MCP Mesh v2.0</strong> — New release with improved performance. <a href=\\"https://github.com/...\\">GitHub</a></li><li><strong>Context Protocol Updates</strong> — Spec clarifications released. <a href=\\"https://spec.com\\">Read spec</a></li></ul><hr><h2>Community Voices</h2><blockquote>\\"The MCP ecosystem is growing faster than expected\\" — @developer on Twitter</blockquote><p>Active discussions on Reddit about best practices for context management...</p><hr><h2>That's It for This Week!</h2><p>Thanks for reading. Got tips for next week's digest? <a href=\\"https://discord.gg/deco\\">Drop by our Discord</a>.</p>",
  "slug": "weekly-digest-2026-w05",
  "summary": "This week covers context engineering going mainstream, new MCP tools, and community highlights.",
  "key_points": "context engineering, MCP Mesh v2.0, community growth, developer tools",
  "meta_title": "Weekly Digest Week 5 2026 | decoNews",
  "meta_description": "Context engineering takes center stage, MCP Mesh v2.0 released, and community highlights in this week's digest.",
  "keywords": "weekly digest, context engineering, mcp, ai tools, community",
  "category": "Industry News",
  "tags": "weekly-digest, context-engineering, mcp, community, developer-tools",
  "author": "decoNews Team",
  "reading_time": 4,
  "image_url": "https://assets.decocache.com/deconews/weekly-digest-2026-w05-cover.png",
  "image_alt_text": "Weekly Digest Week 5 2026 - Abstract geometric composition"
}
\`\`\`
`;
