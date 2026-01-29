/**
 * Bookmarks MCP Prompts
 */

import { createPrompt, type GetPromptResult } from "@decocms/runtime";
import { z } from "zod";
import type { Env } from "./types/env.ts";

/**
 * SETUP_TABLES - Instructions for creating bookmarks tables in Supabase
 */
export const createSetupTablesPrompt = (_env: Env) =>
  createPrompt({
    name: "SETUP_TABLES",
    title: "Setup Bookmarks Tables",
    description: `Create the required tables in Supabase for bookmark storage.

Run this once when setting up a new project with bookmarks.`,
    argsSchema: {},
    execute: (): GetPromptResult => {
      return {
        description: "Create bookmarks tables in Supabase",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `# Setup Bookmarks Tables

## Required Tables

Run these SQL statements in Supabase SQL Editor or via the SUPABASE binding:

### 1. Bookmarks Table

\`\`\`sql
CREATE TABLE IF NOT EXISTS bookmarks (
  id SERIAL PRIMARY KEY,
  url TEXT UNIQUE NOT NULL,
  title TEXT,
  description TEXT,
  icon TEXT,
  stars INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  classified_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  researched_at TIMESTAMPTZ,
  
  -- Metadata
  reading_time_min INTEGER,
  language TEXT,
  
  -- AI Enrichment
  perplexity_research TEXT,
  firecrawl_content TEXT,
  
  -- Insights (different perspectives)
  insight_dev TEXT,
  insight_founder TEXT,
  insight_investor TEXT,
  
  -- User notes
  notes TEXT
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_bookmarks_classified_at ON bookmarks(classified_at);
CREATE INDEX IF NOT EXISTS idx_bookmarks_published_at ON bookmarks(published_at);
CREATE INDEX IF NOT EXISTS idx_bookmarks_stars ON bookmarks(stars);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bookmarks_updated_at
  BEFORE UPDATE ON bookmarks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
\`\`\`

### 2. Bookmark Tags Table

\`\`\`sql
CREATE TABLE IF NOT EXISTS bookmark_tags (
  id SERIAL PRIMARY KEY,
  bookmark_id INTEGER REFERENCES bookmarks(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  UNIQUE(bookmark_id, tag)
);

-- Index for tag lookups
CREATE INDEX IF NOT EXISTS idx_bookmark_tags_tag ON bookmark_tags(tag);
CREATE INDEX IF NOT EXISTS idx_bookmark_tags_bookmark_id ON bookmark_tags(bookmark_id);
\`\`\`

### 3. Enable Row Level Security (Optional)

\`\`\`sql
-- Enable RLS
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmark_tags ENABLE ROW LEVEL SECURITY;

-- Allow public read access (adjust as needed)
CREATE POLICY "Public read access" ON bookmarks
  FOR SELECT USING (true);

CREATE POLICY "Public read access" ON bookmark_tags
  FOR SELECT USING (true);
\`\`\`

## Verification

After running, verify with:
\`\`\`sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('bookmarks', 'bookmark_tags');
\`\`\`

## Next Steps

Once tables are created:
1. Use BOOKMARK_CREATE to add bookmarks
2. Use BOOKMARK_ENRICH_BATCH to research existing bookmarks
3. Use BOOKMARK_IMPORT_CHROME to import from browser`,
            },
          },
        ],
      };
    },
  });

/**
 * ENRICH_WORKFLOW - Workflow for bulk enriching bookmarks
 */
export const createEnrichWorkflowPrompt = (_env: Env) =>
  createPrompt({
    name: "ENRICH_WORKFLOW",
    title: "Enrich Bookmarks Workflow",
    description: `Workflow for bulk enriching bookmarks with AI research and content scraping.`,
    argsSchema: {
      batchSize: z
        .number()
        .optional()
        .default(10)
        .describe("Number of bookmarks to enrich per batch"),
      filterTag: z
        .string()
        .optional()
        .describe("Only enrich bookmarks with this tag"),
    },
    execute: ({ args }): GetPromptResult => {
      const { batchSize, filterTag } = args;

      return {
        description: "Bulk enrich bookmarks with AI",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `# Enrich Bookmarks Workflow

## Goal
Enrich bookmarks that haven't been researched yet with AI-generated insights.

## Step 1: Find Un-enriched Bookmarks

Use BOOKMARK_LIST to find bookmarks where:
- researched_at is null
${filterTag ? `- has tag: ${filterTag}` : ""}

Limit to ${batchSize} bookmarks per batch.

## Step 2: For Each Bookmark

### 2a. Scrape Content (if FIRECRAWL available)
\`\`\`
BOOKMARK_SCRAPE(url: bookmark.url)
\`\`\`

This extracts the main content from the page.

### 2b. Research with AI (if PERPLEXITY available)
\`\`\`
BOOKMARK_RESEARCH(url: bookmark.url)
\`\`\`

This generates:
- Summary of what the page is about
- Key insights
- Relevance assessment

### 2c. Classify and Tag
\`\`\`
BOOKMARK_CLASSIFY(id: bookmark.id)
\`\`\`

This auto-generates:
- Tags based on content
- Reading time estimate
- Language detection
- Insights from different perspectives (dev, founder, investor)

## Step 3: Update Bookmark

Use BOOKMARK_UPDATE to save:
- firecrawl_content
- perplexity_research
- insight_dev, insight_founder, insight_investor
- tags
- classified_at = now()
- researched_at = now()

## Step 4: Report Progress

After each batch:
"Enriched X bookmarks. Y remaining without research.

Would you like to continue with the next batch?"

## Error Handling

If a bookmark fails:
- Log the error
- Continue with next bookmark
- Report failures at end`,
            },
          },
        ],
      };
    },
  });

/**
 * All prompt factory functions.
 */
export const prompts = [createSetupTablesPrompt, createEnrichWorkflowPrompt];
