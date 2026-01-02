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
const OPENROUTER_API_KEY =
  "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";

// Recommended models (cheap and always available)
const RECOMMENDED_MODELS = [
  "meta-llama/llama-3.3-70b-instruct", // ~$0.35/1M tokens, excellent quality
  "meta-llama/llama-3.1-8b-instruct", // ~$0.05/1M tokens, good quality
  "google/gemini-flash-1.5-8b", // ~$0.05/1M tokens
];

// Use default model or one specified in env
const MODEL = process.env.OPENROUTER_MODEL || RECOMMENDED_MODELS[1]; // llama-3.1-8b by default

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
  verified: boolean;
}

interface EnrichedData {
  friendly_name: string;
  mesh_description: string;
  tags: string[];
  categories: string[];
}

// ═══════════════════════════════════════════════════════════════
// OpenRouter API Client
// ═══════════════════════════════════════════════════════════════

/**
 * Call LLM via OpenRouter API directly
 */
async function generateWithLLM(prompt: string): Promise<string> {
  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
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
        temperature: 0.7,
        max_tokens: 1500, // Increased to avoid truncated responses
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
async function enrichMcpWithAI(server: McpServer): Promise<EnrichedData> {
  const name = server.name;
  const description = server.description || server.short_description || "";
  const repoUrl = server.repository?.url || "";
  const hasRemote = (server.remotes?.length ?? 0) > 0;
  const isNpm = server.remotes?.some((r) => r.type === "npm") ?? false;
  const isVerified = server.verified;

  // Serialize remotes for the prompt
  const remotesInfo =
    server.remotes?.map((r) => `${r.type}`).join(", ") || "none";

  const prompt = `You are an expert at analyzing MCP (Model Context Protocol) servers and generating metadata for them.

## MCP Technical Information:
- **Full Name**: ${name}
- **Description**: ${description}
- **Version**: ${server.version}
- **Repository**: ${repoUrl}
- **Remotes**: ${remotesInfo}
- **Has Remote Support**: ${hasRemote}
- **Is NPM Package**: ${isNpm}
- **Is Verified**: ${isVerified}

## Your Task:
Generate metadata in JSON format (respond ONLY with valid JSON, no markdown blocks):

{
  "friendly_name": "Extract the official/brand name from the technical name",
  "mesh_description": "Detailed markdown description (100-200 words)",
  "tags": ["relevant", "lowercase", "tags"],
  "categories": ["1-3", "high-level", "categories"]
}

## IMPORTANT - Language:
- ALL content MUST be in ENGLISH
- If the original description is in another language (Portuguese, Spanish, Chinese, etc.), TRANSLATE it to English
- Keep technical terms and brand names as-is
- Use clear, professional English

## Instructions:

### 1. friendly_name:
- Extract the REAL brand/company name from the technical identifier
- Examples:
  * "com.cloudflare.mcp/mcp" → "Cloudflare"
  * "ai.exa/exa" → "Exa"
  * "com.microsoft/microsoft-learn-mcp" → "Microsoft Learn"
  * "io.github.user/project-name" → "Project Name"
- Keep it short (1-3 words max)
- Use proper capitalization

### 2. mesh_description:
- Write 100-200 words in markdown
- Explain what this MCP does
- Include main features and use cases
- Be professional and informative
- Use bullet points or sections if helpful

### 3. tags:
- 5-8 specific, relevant tags
- All lowercase
- Examples: "search", "database", "ai", "monitoring", "cloud", "api"
- Focus on functionality and technology

### 4. categories:
- Pick 1-3 from this list ONLY:
  * productivity, development, data, ai, communication, infrastructure, security, monitoring, analytics, automation
- Choose the most relevant ones

## Response Format:
- ONLY valid JSON
- NO markdown code blocks
- NO explanations outside the JSON`;

  // Retry loop - retry LLM call if it fails
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(
        `   🤖 Calling LLM for ${name}... (attempt ${attempt}/${maxAttempts})`,
      );
      const response = await generateWithLLM(prompt);

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
  let query = supabase
    .from("mcp_servers")
    .select(
      "name, version, description, short_description, friendly_name, mesh_description, tags, categories, repository, remotes, verified",
    )
    .eq("is_latest", true) // Only latest versions
    .order("verified", { ascending: false }) // Verified first
    .order("name");

  if (!force) {
    // Only MCPs without data
    query = query.or(
      "friendly_name.is.null,mesh_description.is.null,tags.is.null,categories.is.null",
    );
  }

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Error fetching MCPs: ${error.message}`);
  }

  return (data || []) as McpServer[];
}

/**
 * Update an MCP with enriched data (ALL versions)
 */
async function updateMcp(
  supabase: SupabaseClient,
  name: string,
  data: EnrichedData,
): Promise<number> {
  // Update ALL versions with this name
  const {
    data: updated,
    error,
    count,
  } = await supabase
    .from("mcp_servers")
    .update({
      friendly_name: data.friendly_name,
      mesh_description: data.mesh_description,
      tags: data.tags,
      categories: data.categories,
      updated_at: new Date().toISOString(),
    })
    .eq("name", name) // name doesn't include version, so it gets all versions
    .select();

  if (error) {
    throw new Error(`Error updating MCP ${name}: ${error.message}`);
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

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing environment variables:");
    if (!supabaseUrl) console.error("   - SUPABASE_URL");
    if (!supabaseKey) console.error("   - SUPABASE_SERVICE_ROLE_KEY");
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

    // 2. Process each MCP
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < mcps.length; i++) {
      const mcp = mcps[i];
      console.log(
        `\n[${i + 1}/${mcps.length}] Processing: ${mcp.name}${mcp.verified ? " ⭐" : ""}`,
      );

      try {
        // Generate enriched data
        const enriched = await enrichMcpWithAI(mcp);

        // Update database (ALL versions)
        const versionsUpdated = await updateMcp(supabase, mcp.name, enriched);

        console.log(
          `   ✅ Updated ${versionsUpdated} version${versionsUpdated > 1 ? "s" : ""} successfully`,
        );
        console.log(`      Name: ${enriched.friendly_name}`);
        console.log(
          `      Tags: ${enriched.tags.slice(0, 3).join(", ")}${enriched.tags.length > 3 ? "..." : ""}`,
        );
        console.log(`      Categories: ${enriched.categories.join(", ")}`);

        successCount++;

        // Rate limiting - wait 2s between requests
        if (i < mcps.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error(`   ❌ Error: ${error}`);
        errorCount++;

        // Continue with next ones
        continue;
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
