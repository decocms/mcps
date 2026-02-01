/**
 * Memory tools for Task Runner
 *
 * Inspired by OpenClaw's memory system:
 * - memory/YYYY-MM-DD.md: Daily log (append-only)
 * - MEMORY.md: Curated long-term memory
 *
 * The agent writes discoveries, decisions, and learnings to these files
 * so the project accumulates knowledge over time.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../shared/deco.gen.ts";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from "fs";
import { join } from "path";
import { getWorkspace } from "./workspace.ts";

// Get today's date in YYYY-MM-DD format
function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

// Get yesterday's date in YYYY-MM-DD format
function getYesterday(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().split("T")[0];
}

// Get memory directory path
function getMemoryDir(): string | null {
  const workspace = getWorkspace();
  if (!workspace) return null;
  return join(workspace, "memory");
}

// Get MEMORY.md path
function getLongTermMemoryPath(): string | null {
  const workspace = getWorkspace();
  if (!workspace) return null;
  return join(workspace, "MEMORY.md");
}

// Ensure memory directory exists
function ensureMemoryDir(): string | null {
  const memoryDir = getMemoryDir();
  if (!memoryDir) return null;
  if (!existsSync(memoryDir)) {
    mkdirSync(memoryDir, { recursive: true });
  }
  return memoryDir;
}

// ============================================================================
// MEMORY_WRITE
// ============================================================================

export const createMemoryWriteTool = (_env: Env) =>
  createPrivateTool({
    id: "MEMORY_WRITE",
    description: `Write a memory entry. Use this to record discoveries, decisions, and learnings.

Types:
- "daily": Day-to-day notes, discoveries, running context → memory/YYYY-MM-DD.md
- "longterm": Durable facts, decisions, preferences, architecture → MEMORY.md

Examples of what to write:
- "Discovered that component X uses pattern Y"
- "Decision: Using approach A over B because..."
- "The user prefers camelCase for variable names"
- "Important: API endpoint requires auth header X"`,
    inputSchema: z.object({
      type: z.enum(["daily", "longterm"]).describe("Memory type: 'daily' for running notes, 'longterm' for curated facts"),
      content: z.string().describe("The content to write (Markdown)"),
      category: z.string().optional().describe("Optional category tag (e.g., 'architecture', 'decision', 'discovery')"),
    }),
    execute: async ({ context }) => {
      const { type, content, category } = context;
      const workspace = getWorkspace();
      if (!workspace) {
        return { success: false, error: "No workspace set. Call WORKSPACE_SET first." };
      }

      try {
        let filePath: string;
        let formattedContent: string;

        if (type === "daily") {
          const memoryDir = ensureMemoryDir();
          if (!memoryDir) {
            return { success: false, error: "Could not create memory directory" };
          }
          filePath = join(memoryDir, `${getToday()}.md`);

          // Format with timestamp and optional category
          const timestamp = new Date().toLocaleTimeString("en-US", { hour12: false });
          const categoryTag = category ? ` [${category}]` : "";
          formattedContent = `\n## ${timestamp}${categoryTag}\n\n${content}\n`;
        } else {
          // longterm
          const longTermPath = getLongTermMemoryPath();
          if (!longTermPath) {
            return { success: false, error: "Could not determine MEMORY.md path" };
          }
          filePath = longTermPath;

          // Format with category header if provided
          const categoryHeader = category ? `### ${category}\n\n` : "";
          formattedContent = `\n${categoryHeader}${content}\n`;
        }

        // Create file with header if it doesn't exist
        if (!existsSync(filePath)) {
          const header = type === "daily"
            ? `# Daily Log - ${getToday()}\n\nRunning notes and discoveries.\n`
            : `# Project Memory\n\nCurated knowledge about this project.\n`;
          writeFileSync(filePath, header, "utf-8");
        }

        // Append the content
        appendFileSync(filePath, formattedContent, "utf-8");

        return {
          success: true,
          file: filePath,
          type,
          message: `Memory written to ${type === "daily" ? `memory/${getToday()}.md` : "MEMORY.md"}`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

// ============================================================================
// MEMORY_READ
// ============================================================================

export const createMemoryReadTool = (_env: Env) =>
  createPrivateTool({
    id: "MEMORY_READ",
    description: `Read memory files to recall past discoveries and decisions.

By default reads today + yesterday's daily logs and MEMORY.md.
Use this at session start to load context about the project.`,
    inputSchema: z.object({
      type: z.enum(["daily", "longterm", "recent", "all"]).optional().default("recent").describe(
        "'daily': Today's log, 'longterm': MEMORY.md, 'recent': Today + yesterday + MEMORY.md, 'all': Everything"
      ),
      date: z.string().optional().describe("Specific date for daily log (YYYY-MM-DD)"),
    }),
    execute: async ({ context }) => {
      const { type = "recent", date } = context;
      const workspace = getWorkspace();
      if (!workspace) {
        return { success: false, error: "No workspace set. Call WORKSPACE_SET first." };
      }

      try {
        const results: { file: string; content: string }[] = [];
        const memoryDir = getMemoryDir();
        const longTermPath = getLongTermMemoryPath();

        // Read MEMORY.md
        if (type === "longterm" || type === "recent" || type === "all") {
          if (longTermPath && existsSync(longTermPath)) {
            results.push({
              file: "MEMORY.md",
              content: readFileSync(longTermPath, "utf-8"),
            });
          }
        }

        // Read daily logs
        if (type === "daily" || type === "recent" || type === "all") {
          if (memoryDir && existsSync(memoryDir)) {
            if (date) {
              // Specific date
              const dailyPath = join(memoryDir, `${date}.md`);
              if (existsSync(dailyPath)) {
                results.push({
                  file: `memory/${date}.md`,
                  content: readFileSync(dailyPath, "utf-8"),
                });
              }
            } else if (type === "all") {
              // All daily logs
              const files = readdirSync(memoryDir)
                .filter(f => f.endsWith(".md"))
                .sort()
                .reverse(); // Most recent first
              for (const file of files.slice(0, 7)) { // Last 7 days max
                const dailyPath = join(memoryDir, file);
                results.push({
                  file: `memory/${file}`,
                  content: readFileSync(dailyPath, "utf-8"),
                });
              }
            } else {
              // Today + yesterday (recent or daily without date)
              for (const day of [getToday(), getYesterday()]) {
                const dailyPath = join(memoryDir, `${day}.md`);
                if (existsSync(dailyPath)) {
                  results.push({
                    file: `memory/${day}.md`,
                    content: readFileSync(dailyPath, "utf-8"),
                  });
                }
              }
            }
          }
        }

        if (results.length === 0) {
          return {
            success: true,
            message: "No memory files found. Start writing memories to build project knowledge.",
            files: [],
          };
        }

        return {
          success: true,
          files: results,
          totalFiles: results.length,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

// ============================================================================
// MEMORY_SEARCH
// ============================================================================

export const createMemorySearchTool = (_env: Env) =>
  createPrivateTool({
    id: "MEMORY_SEARCH",
    description: "Search memory files for specific keywords or phrases",
    inputSchema: z.object({
      query: z.string().describe("Search query (case-insensitive)"),
    }),
    execute: async ({ context }) => {
      const { query } = context;
      const workspace = getWorkspace();
      if (!workspace) {
        return { success: false, error: "No workspace set. Call WORKSPACE_SET first." };
      }

      try {
        const results: { file: string; matches: string[] }[] = [];
        const queryLower = query.toLowerCase();
        const memoryDir = getMemoryDir();
        const longTermPath = getLongTermMemoryPath();

        // Search MEMORY.md
        if (longTermPath && existsSync(longTermPath)) {
          const content = readFileSync(longTermPath, "utf-8");
          const lines = content.split("\n");
          const matches = lines.filter(line => line.toLowerCase().includes(queryLower));
          if (matches.length > 0) {
            results.push({ file: "MEMORY.md", matches });
          }
        }

        // Search daily logs
        if (memoryDir && existsSync(memoryDir)) {
          const files = readdirSync(memoryDir).filter(f => f.endsWith(".md")).sort().reverse();
          for (const file of files) {
            const content = readFileSync(join(memoryDir, file), "utf-8");
            const lines = content.split("\n");
            const matches = lines.filter(line => line.toLowerCase().includes(queryLower));
            if (matches.length > 0) {
              results.push({ file: `memory/${file}`, matches: matches.slice(0, 10) }); // Limit matches per file
            }
          }
        }

        return {
          success: true,
          query,
          results,
          totalMatches: results.reduce((sum, r) => sum + r.matches.length, 0),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

// ============================================================================
// Export all memory tools
// ============================================================================

export const memoryTools = [
  createMemoryWriteTool,
  createMemoryReadTool,
  createMemorySearchTool,
];
