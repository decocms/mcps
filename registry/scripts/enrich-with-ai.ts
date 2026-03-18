#!/usr/bin/env bun
/**
 * Script to enrich Registry MCPs with AI-generated data
 *
 * Uses OpenRouter MCP with free models to generate:
 * - friendly_name: User-friendly display name
 * - mesh_description: Detailed markdown description
 * - tags: Array of relevant tags
 * - categories: Array of categories
 *
 * Usage:
 *   bun run scripts/enrich-with-ai.ts [--force] [--limit=10]
 *
 * Flags:
 *   --force: Regenerate even for MCPs that already have data
 *   --limit: Limit how many MCPs to process (default: all)
 *
 * Environment variables:
 *   SUPABASE_URL - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Supabase service role key
 *   OPENROUTER_API_KEY - OpenRouter API key
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ═══════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Recommended models (quality + cost balance)
const RECOMMENDED_MODELS = [
  "google/gemini-2.0-flash-001", // Fast, high quality, cheap
  "anthropic/claude-3.5-haiku", // Great quality, affordable
  "meta-llama/llama-3.3-70b-instruct", // Good open-source option
];

// Use default model or one specified in env
const MODEL = process.env.OPENROUTER_MODEL || RECOMMENDED_MODELS[0];

// Concurrency for AI enrichment
const ENRICH_CONCURRENCY = 5;

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface McpServer {
  name: string;
  version: string;
  description: string | null;
  short_description: string | null;
  friendly_name: string | null;
  mesh_description: string | null;
  tags: string[] | null;
  categories: string[] | null;
  repository: { url: string } | null;
  remotes: Array<{ type: string }> | null;
  icons: Array<{ src: string; mimeType?: string; theme?: string }> | null;
  verified: boolean;
}

interface EnrichedData {
  friendly_name: string;
  mesh_description: string;
  tags: string[];
  categories: string[];
  icon_url: string | null;
}

// ═══════════════════════════════════════════════════════════════
// OpenRouter API Client
// ═══════════════════════════════════════════════════════════════

/**
 * Call LLM via OpenRouter API directly
 */
async function generateWithLLM(
  prompt: string,
  apiKey: string,
): Promise<string> {
  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://github.com/decocms/mcps",
        "X-Title": "MCP Registry AI Enrichment",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenRouter API error (${response.status}): ${errorText}`,
      );
    }

    const result = await response.json();
    return result.choices?.[0]?.message?.content || "";
  } catch (error) {
    console.error(`Error calling LLM: ${error}`);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════
// AI Enrichment Logic
// ═══════════════════════════════════════════════════════════════

/**
 * Generate enriched data for an MCP using AI
 */
async function enrichMcpWithAI(
  server: McpServer,
  apiKey: string,
): Promise<EnrichedData> {
  const name = server.name;
  const description = server.description || server.short_description || "";
  const repoUrl = server.repository?.url || "";
  const hasRemote = (server.remotes?.length ?? 0) > 0;
  const isNpm = server.remotes?.some((r) => r.type === "npm") ?? false;
  const isVerified = server.verified;

  // Serialize remotes for the prompt
  const remotesInfo =
    server.remotes?.map((r) => `${r.type}`).join(", ") || "none";

  const prompt = `You generate metadata for MCP (Model Context Protocol) servers. Respond with ONLY valid JSON, nothing else.

Input:
- ID: ${name}
- Description: ${description || "(none)"}
- Repo: ${repoUrl || "(none)"}
- Remotes: ${remotesInfo}

Output this exact JSON structure:
{"friendly_name":"...","mesh_description":"...","tags":[...],"categories":[...],"icon_url":"..."}

Rules for each field:

friendly_name — The name of the SERVICE or PRODUCT this MCP connects to. This is what users see in a marketplace.
- The name must identify WHAT SERVICE the MCP integrates with, NOT who published it
- The ID has the format "publisher/project". The publisher prefix (com.xxx, ai.xxx, io.github.xxx) is the AUTHOR — ignore it for naming
- Look at the project part AND the description to determine the actual service/product
- CRITICAL: If the description or project name mentions a well-known service (Notion, Slack, GitHub, PostgreSQL, etc.), use THAT as the name
- For original tools that don't wrap an external service, derive the name from the project part
- NEVER use the publisher/author name as the friendly_name
- NEVER include "MCP Server" or "MCP" suffix
- Keep it as short as possible — prefer 1-2 words when the brand name alone is sufficient
- 1-4 words max, proper capitalization
- Examples:
  "ai.smithery/smithery-notion" → "Notion" (it's a Notion integration, NOT Smithery)
  "ai.smithery/smithery-slack" → "Slack" (it integrates with Slack)
  "com.stripe/stripe-agent-toolkit" → "Stripe Agent Toolkit"
  "ai.exa/exa" → "Exa" (Exa IS the product, do NOT add extra words like "Code" or "Search")
  "io.github.someuser/postgres-query" → "Postgres Query"
  "com.microsoft/microsoft-learn-mcp" → "Microsoft Learn"
  "io.github.user/weather-api-server" → "Weather API"
  "dev.supabase/supabase-mcp" → "Supabase"
  "io.github.user/github-issues-tool" → "GitHub Issues"
  "ai.acme/jira-connector" → "Jira Connector" (NOT "Acme")

mesh_description — A concise, informative description (80-150 words, plain text, NO markdown).
- First sentence: what it does in one line
- Then 2-3 sentences covering key features, integrations, and use cases
- Write in third person ("Provides...", "Enables...", "Connects...")
- MUST be in English (translate if needed)
- Be factual — only describe what the description/name suggests, don't invent features

tags — 4-6 lowercase tags describing functionality and technology.
- Be specific: prefer "postgresql" over "database", "github" over "code"
- Include the primary technology/platform and the main use case
- No generic tags like "tool", "server", "mcp"

categories — 1-2 from ONLY this list: productivity, development, data, ai, communication, infrastructure, security, monitoring, analytics, automation
- Pick the most relevant. When in doubt, pick fewer.

icon_url — A URL for the service/product's official icon or logo.
- If this MCP connects to a well-known service, use that service's favicon: "https://<domain>/favicon.ico"
- For GitHub-hosted projects, use the owner's GitHub avatar: "https://github.com/<owner>.png"
- Examples:
  Notion MCP → "https://www.notion.so/images/favicon.ico"
  Slack MCP → "https://slack.com/favicon.ico"
  GitHub tool → "https://github.com/github.png"
  "io.github.someuser/tool" → "https://github.com/someuser.png"
- If you cannot determine a reasonable icon URL, use null`;

  // Retry loop - retry LLM call if it fails
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(
        `   🤖 Calling LLM for ${name}... (attempt ${attempt}/${maxAttempts})`,
      );
      const response = await generateWithLLM(prompt, apiKey);

      // Try to extract JSON from response (in case it comes with markdown)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      let jsonStr = jsonMatch[0];

      // Try to repair common JSON issues: unterminated strings at the end
      // Pattern: "field": "text without closing
      if (jsonStr.match(/:\s*"[^"]*$/)) {
        console.log(`   🔧 Attempting to fix unterminated string...`);
        jsonStr = jsonStr + '"}';
      }

      const data = JSON.parse(jsonStr);

      // Validate required fields
      if (
        !data.friendly_name ||
        !data.mesh_description ||
        !Array.isArray(data.tags) ||
        !Array.isArray(data.categories)
      ) {
        throw new Error("Invalid response format - missing required fields");
      }

      // Success!
      return {
        friendly_name: data.friendly_name,
        mesh_description: data.mesh_description,
        tags: data.tags,
        categories: data.categories,
        icon_url: data.icon_url || null,
      };
    } catch (error) {
      if (attempt === maxAttempts) {
        console.error(`   ❌ Failed after ${maxAttempts} attempts`);
        throw error;
      }
      console.log(`   ⚠️  Attempt ${attempt} failed, retrying...`);
      // Wait 1s before retrying LLM call
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // TypeScript needs this (will never reach here)
  throw new Error("Unreachable");
}

// ═══════════════════════════════════════════════════════════════
// Database Operations
// ═══════════════════════════════════════════════════════════════

/**
 * Fetch MCPs that need to be enriched
 */
async function getMcpsToEnrich(
  supabase: SupabaseClient,
  force: boolean,
  limit?: number,
): Promise<McpServer[]> {
  const allResults: McpServer[] = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    let query = supabase
      .from("mcp_servers")
      .select(
        "name, version, description, short_description, friendly_name, mesh_description, tags, categories, repository, remotes, icons, verified",
      )
      .eq("is_latest", true)
      .order("verified", { ascending: false })
      .order("name")
      .range(offset, offset + pageSize - 1);

    if (!force) {
      query = query.or(
        "friendly_name.is.null,mesh_description.is.null,tags.is.null,categories.is.null,icons.is.null",
      );
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Error fetching MCPs: ${error.message}`);
    }

    const rows = (data || []) as McpServer[];
    allResults.push(...rows);

    if (rows.length < pageSize) break; // Last page
    offset += pageSize;
  }

  // Apply limit after fetching all
  if (limit) {
    return allResults.slice(0, limit);
  }

  return allResults;
}

/**
 * Update an MCP with enriched data (ALL versions)
 */
async function updateMcp(
  supabase: SupabaseClient,
  server: McpServer,
  data: EnrichedData,
): Promise<number> {
  const updatePayload: Record<string, unknown> = {
    friendly_name: data.friendly_name,
    mesh_description: data.mesh_description,
    tags: data.tags,
    categories: data.categories,
    updated_at: new Date().toISOString(),
  };

  // Only set icons if the server doesn't already have them and AI suggested one
  const hasExistingIcons =
    Array.isArray(server.icons) && server.icons.length > 0;
  if (!hasExistingIcons && data.icon_url) {
    updatePayload.icons = [{ src: data.icon_url }];
  }

  // Update ALL versions with this name
  const {
    data: updated,
    error,
    count,
  } = await supabase
    .from("mcp_servers")
    .update(updatePayload)
    .eq("name", server.name)
    .select();

  if (error) {
    throw new Error(`Error updating MCP ${server.name}: ${error.message}`);
  }

  const versionsUpdated = count || updated?.length || 0;
  return versionsUpdated;
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("           MCP Registry AI Enrichment");
  console.log("═══════════════════════════════════════════════════════════\n");

  // Parse arguments
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const limitArg = args.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : undefined;

  console.log("⚙️  Configuration:");
  console.log(`   Model: ${MODEL}`);
  console.log(`   Force re-generate: ${force}`);
  console.log(`   Limit: ${limit || "no limit"}\n`);

  // Check environment variables
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openrouterApiKey = process.env.OPENROUTER_API_KEY;

  if (!supabaseUrl || !supabaseKey || !openrouterApiKey) {
    console.error("❌ Missing environment variables:");
    if (!supabaseUrl) console.error("   - SUPABASE_URL");
    if (!supabaseKey) console.error("   - SUPABASE_SERVICE_ROLE_KEY");
    if (!openrouterApiKey) console.error("   - OPENROUTER_API_KEY");
    process.exit(1);
  }

  // Create Supabase client
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // 1. Fetch MCPs to enrich
    console.log("📋 Fetching MCPs to enrich...");
    const mcps = await getMcpsToEnrich(supabase, force, limit);
    console.log(`   Found ${mcps.length} MCPs to process\n`);

    if (mcps.length === 0) {
      console.log("✅ All MCPs are already enriched!");
      return;
    }

    // 2. Process MCPs with concurrency
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < mcps.length; i += ENRICH_CONCURRENCY) {
      const batch = mcps.slice(i, i + ENRICH_CONCURRENCY);

      const results = await Promise.allSettled(
        batch.map(async (mcp, idx) => {
          const globalIdx = i + idx + 1;
          console.log(
            `\n[${globalIdx}/${mcps.length}] Processing: ${mcp.name}${mcp.verified ? " ⭐" : ""}`,
          );

          const enriched = await enrichMcpWithAI(mcp, openrouterApiKey);
          const versionsUpdated = await updateMcp(supabase, mcp, enriched);

          console.log(
            `   ✅ [${globalIdx}] ${enriched.friendly_name} (${enriched.categories.join(", ")})`,
          );

          return { name: mcp.name, enriched, versionsUpdated };
        }),
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          successCount++;
        } else {
          errorCount++;
          console.error(`   ❌ Error: ${result.reason}`);
        }
      }

      // Brief delay between batches
      if (i + ENRICH_CONCURRENCY < mcps.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // 3. Print summary
    console.log(
      "\n═══════════════════════════════════════════════════════════",
    );
    console.log("                        DONE!");
    console.log(
      "═══════════════════════════════════════════════════════════\n",
    );

    console.log("📊 Summary:");
    console.log(`   Total processed: ${mcps.length}`);
    console.log(`   Success: ${successCount}`);
    console.log(`   Errors: ${errorCount}`);
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

main();
