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
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  readdirSync,
} from "fs";
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
      type: z
        .enum(["daily", "longterm"])
        .describe(
          "Memory type: 'daily' for running notes, 'longterm' for curated facts",
        ),
      content: z.string().describe("The content to write (Markdown)"),
      category: z
        .string()
        .optional()
        .describe(
          "Optional category tag (e.g., 'architecture', 'decision', 'discovery')",
        ),
    }),
    execute: async ({ context }) => {
      const { type, content, category } = context;
      const workspace = getWorkspace();
      if (!workspace) {
        return {
          success: false,
          error: "No workspace set. Call WORKSPACE_SET first.",
        };
      }

      try {
        let filePath: string;
        let formattedContent: string;

        if (type === "daily") {
          const memoryDir = ensureMemoryDir();
          if (!memoryDir) {
            return {
              success: false,
              error: "Could not create memory directory",
            };
          }
          filePath = join(memoryDir, `${getToday()}.md`);

          // Format with timestamp and optional category
          const timestamp = new Date().toLocaleTimeString("en-US", {
            hour12: false,
          });
          const categoryTag = category ? ` [${category}]` : "";
          formattedContent = `\n## ${timestamp}${categoryTag}\n\n${content}\n`;
        } else {
          // longterm
          const longTermPath = getLongTermMemoryPath();
          if (!longTermPath) {
            return {
              success: false,
              error: "Could not determine MEMORY.md path",
            };
          }
          filePath = longTermPath;

          // Format with category header if provided
          const categoryHeader = category ? `### ${category}\n\n` : "";
          formattedContent = `\n${categoryHeader}${content}\n`;
        }

        // Create file with header if it doesn't exist
        if (!existsSync(filePath)) {
          const header =
            type === "daily"
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
      type: z
        .enum(["daily", "longterm", "recent", "all"])
        .optional()
        .default("recent")
        .describe(
          "'daily': Today's log, 'longterm': MEMORY.md, 'recent': Today + yesterday + MEMORY.md, 'all': Everything",
        ),
      date: z
        .string()
        .optional()
        .describe("Specific date for daily log (YYYY-MM-DD)"),
    }),
    execute: async ({ context }) => {
      const { type = "recent", date } = context;
      const workspace = getWorkspace();
      if (!workspace) {
        return {
          success: false,
          error: "No workspace set. Call WORKSPACE_SET first.",
        };
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
                .filter((f) => f.endsWith(".md"))
                .sort()
                .reverse(); // Most recent first
              for (const file of files.slice(0, 7)) {
                // Last 7 days max
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
            message:
              "No memory files found. Start writing memories to build project knowledge.",
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
        return {
          success: false,
          error: "No workspace set. Call WORKSPACE_SET first.",
        };
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
          const matches = lines.filter((line) =>
            line.toLowerCase().includes(queryLower),
          );
          if (matches.length > 0) {
            results.push({ file: "MEMORY.md", matches });
          }
        }

        // Search daily logs
        if (memoryDir && existsSync(memoryDir)) {
          const files = readdirSync(memoryDir)
            .filter((f) => f.endsWith(".md"))
            .sort()
            .reverse();
          for (const file of files) {
            const content = readFileSync(join(memoryDir, file), "utf-8");
            const lines = content.split("\n");
            const matches = lines.filter((line) =>
              line.toLowerCase().includes(queryLower),
            );
            if (matches.length > 0) {
              results.push({
                file: `memory/${file}`,
                matches: matches.slice(0, 10),
              }); // Limit matches per file
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
// MEMORY_RECORD_ERROR - Special tool for recording error patterns
// ============================================================================

export const createMemoryRecordErrorTool = (_env: Env) =>
  createPrivateTool({
    id: "MEMORY_RECORD_ERROR",
    description: `Record an error pattern and its fix. This helps future agents avoid the same mistake.

Use this whenever you:
1. Encounter an error and successfully fix it
2. Discover a non-obvious gotcha in the codebase
3. Find a workaround for a tricky issue

The error will be saved to MEMORY.md under "## Error Patterns" so future sessions can learn from it.`,
    inputSchema: z.object({
      errorType: z
        .string()
        .describe(
          "Brief name for the error (e.g., 'TypeScript Generic Constraint')",
        ),
      errorMessage: z.string().describe("The error message or symptom"),
      fix: z.string().describe("How you fixed it or worked around it"),
      context: z
        .string()
        .optional()
        .describe("Additional context about when this occurs"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const { errorType, errorMessage, fix, context: extraContext } = context;
      const workspace = getWorkspace();
      if (!workspace) {
        return { success: false, message: "No workspace set" };
      }

      const longTermPath = getLongTermMemoryPath();
      if (!longTermPath) {
        return {
          success: false,
          message: "Could not determine MEMORY.md path",
        };
      }

      const timestamp = new Date().toISOString().split("T")[0];
      const contextNote = extraContext
        ? `\n- **Context**: ${extraContext}`
        : "";

      const entry = `
### ${errorType} (${timestamp})
- **Error**: \`${errorMessage.slice(0, 200)}${errorMessage.length > 200 ? "..." : ""}\`
- **Fix**: ${fix}${contextNote}

`;

      try {
        // Read existing content or create new
        let existingContent = "";
        if (existsSync(longTermPath)) {
          existingContent = readFileSync(longTermPath, "utf-8");
        } else {
          existingContent =
            "# Project Memory\n\nCurated knowledge about this project.\n";
        }

        // Check if Error Patterns section exists
        if (!existingContent.includes("## Error Patterns")) {
          existingContent +=
            "\n## Error Patterns\n\nCommon errors and their fixes:\n";
        }

        // Insert the new entry after "## Error Patterns"
        const insertPoint = existingContent.indexOf("## Error Patterns");
        const sectionEnd = existingContent.indexOf("\n## ", insertPoint + 16);

        let newContent: string;
        if (sectionEnd === -1) {
          // No more sections after, append to end
          newContent = existingContent + entry;
        } else {
          // Insert before the next section
          newContent =
            existingContent.slice(0, sectionEnd) +
            entry +
            existingContent.slice(sectionEnd);
        }

        writeFileSync(longTermPath, newContent, "utf-8");

        return {
          success: true,
          message: `Recorded error pattern: ${errorType}`,
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

// ============================================================================
// MEMORY_RECORD_LEARNING - Record a general learning from a session
// ============================================================================

export const createMemoryRecordLearningTool = (_env: Env) =>
  createPrivateTool({
    id: "MEMORY_RECORD_LEARNING",
    description: `Record a key learning or insight from the current session.

Use this to capture:
1. Important patterns discovered in the codebase
2. Decisions made and their rationale
3. Key dependencies or constraints
4. Preferred approaches for this project

Learnings are saved to MEMORY.md under appropriate categories.`,
    inputSchema: z.object({
      category: z
        .enum([
          "architecture",
          "patterns",
          "decisions",
          "constraints",
          "preferences",
          "dependencies",
          "gotchas",
        ])
        .describe("Category for the learning"),
      learning: z.string().describe("The learning or insight to record"),
      importance: z
        .enum(["low", "medium", "high"])
        .optional()
        .default("medium")
        .describe("How important is this learning?"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const { category, learning, importance = "medium" } = context;
      const workspace = getWorkspace();
      if (!workspace) {
        return { success: false, message: "No workspace set" };
      }

      const longTermPath = getLongTermMemoryPath();
      if (!longTermPath) {
        return {
          success: false,
          message: "Could not determine MEMORY.md path",
        };
      }

      const timestamp = new Date().toISOString().split("T")[0];
      const importanceEmoji =
        importance === "high" ? "🔴" : importance === "medium" ? "🟡" : "🟢";
      const categoryTitle =
        category.charAt(0).toUpperCase() + category.slice(1);
      const sectionHeader = `## ${categoryTitle}`;

      const entry = `- ${importanceEmoji} ${learning} _(${timestamp})_\n`;

      try {
        // Read existing content or create new
        let existingContent = "";
        if (existsSync(longTermPath)) {
          existingContent = readFileSync(longTermPath, "utf-8");
        } else {
          existingContent =
            "# Project Memory\n\nCurated knowledge about this project.\n";
        }

        // Check if section exists
        if (!existingContent.includes(sectionHeader)) {
          existingContent += `\n${sectionHeader}\n\n`;
        }

        // Find the section and append after the header line
        const sectionIndex = existingContent.indexOf(sectionHeader);
        const afterHeader = sectionIndex + sectionHeader.length;
        // Skip to end of line
        const lineEnd = existingContent.indexOf("\n", afterHeader);

        let newContent: string;
        if (lineEnd === -1) {
          newContent = existingContent + "\n" + entry;
        } else {
          // Insert after the header line (and any blank line after)
          let insertPoint = lineEnd + 1;
          while (existingContent[insertPoint] === "\n") insertPoint++;
          newContent =
            existingContent.slice(0, insertPoint) +
            entry +
            existingContent.slice(insertPoint);
        }

        writeFileSync(longTermPath, newContent, "utf-8");

        return {
          success: true,
          message: `Recorded ${category} learning`,
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

// ============================================================================
// MEMORY_KNOWLEDGE - Knowledge base with LEARNED: prefix pattern
// Inspired by: https://github.com/AvivK5498/Claude-Code-Beads-Orchestration
// ============================================================================

export const createMemoryKnowledgeTool = (_env: Env) =>
  createPrivateTool({
    id: "MEMORY_KNOWLEDGE",
    description: `Add an entry to the project knowledge base using the LEARNED: pattern.

Use this to voluntarily capture conventions, gotchas, and insights as you work.
Entries are tagged and searchable for future sessions.

Examples:
- "TaskGroup requires @Sendable closures in strict concurrency mode"
- "API rate limit is 100 req/min - add exponential backoff"
- "Component X uses pattern Y for state management"`,
    inputSchema: z.object({
      insight: z.string().describe("The knowledge/insight to record"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Tags for categorization (e.g., ['api', 'performance'])"),
      taskId: z.string().optional().describe("Source task ID if applicable"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      entryId: z.string(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const { insight, tags, taskId } = context;
      const workspace = getWorkspace();
      if (!workspace) {
        return { success: false, entryId: "", message: "No workspace set" };
      }

      const memoryDir = getMemoryDir();
      if (!memoryDir) {
        return {
          success: false,
          entryId: "",
          message: "Could not determine memory directory",
        };
      }

      // Ensure memory directory exists
      if (!existsSync(memoryDir)) {
        mkdirSync(memoryDir, { recursive: true });
      }

      const knowledgePath = join(memoryDir, "knowledge.jsonl");
      const entryId = `kn-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`;

      const entry = {
        id: entryId,
        insight,
        tags: tags ?? [],
        taskId,
        timestamp: new Date().toISOString(),
      };

      try {
        appendFileSync(knowledgePath, JSON.stringify(entry) + "\n", "utf-8");
        return {
          success: true,
          entryId,
          message: `LEARNED: ${insight.slice(0, 50)}...`,
        };
      } catch (error) {
        return {
          success: false,
          entryId: "",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

// ============================================================================
// MEMORY_RECALL - Search the knowledge base
// ============================================================================

export const createMemoryRecallTool = (_env: Env) =>
  createPrivateTool({
    id: "MEMORY_RECALL",
    description: `Search the project knowledge base for past learnings.

Search by keyword or tag to find relevant insights from previous sessions.`,
    inputSchema: z.object({
      query: z.string().optional().describe("Keyword search"),
      tags: z.array(z.string()).optional().describe("Filter by tags"),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe("Max results to return"),
    }),
    outputSchema: z.object({
      entries: z.array(
        z.object({
          id: z.string(),
          insight: z.string(),
          tags: z.array(z.string()),
          taskId: z.string().optional(),
          timestamp: z.string(),
        }),
      ),
      total: z.number(),
    }),
    execute: async ({ context }) => {
      const { query, tags, limit } = context;
      const workspace = getWorkspace();
      if (!workspace) {
        return { entries: [], total: 0 };
      }

      const memoryDir = getMemoryDir();
      if (!memoryDir) {
        return { entries: [], total: 0 };
      }

      const knowledgePath = join(memoryDir, "knowledge.jsonl");
      if (!existsSync(knowledgePath)) {
        return { entries: [], total: 0 };
      }

      try {
        const content = readFileSync(knowledgePath, "utf-8");
        const lines = content.trim().split("\n").filter(Boolean);

        let entries = lines
          .map((line) => {
            try {
              return JSON.parse(line);
            } catch {
              return null;
            }
          })
          .filter(Boolean);

        // Filter by query
        if (query) {
          const lowerQuery = query.toLowerCase();
          entries = entries.filter((e: { insight: string }) =>
            e.insight.toLowerCase().includes(lowerQuery),
          );
        }

        // Filter by tags
        if (tags && tags.length > 0) {
          entries = entries.filter((e: { tags: string[] }) =>
            tags.some((t) => e.tags.includes(t)),
          );
        }

        // Sort by timestamp (newest first) and limit
        entries.sort((a: { timestamp: string }, b: { timestamp: string }) =>
          b.timestamp.localeCompare(a.timestamp),
        );
        entries = entries.slice(0, limit ?? 10);

        return {
          entries,
          total: entries.length,
        };
      } catch (error) {
        console.error("Knowledge recall error:", error);
        return { entries: [], total: 0 };
      }
    },
  });

// ============================================================================
// TASK_RETRO - Run a retrospective after task completion
// Inspired by: https://github.com/JeremyKalmus/parade
// ============================================================================

export const createTaskRetroTool = (_env: Env) =>
  createPrivateTool({
    id: "TASK_RETRO",
    description: `Run a retrospective analysis after completing a task.

Captures:
- What went well
- What could be improved
- Patterns discovered
- Recommendations for similar future tasks

Retrospectives are stored in .beads/retrospectives/ for future reference.`,
    inputSchema: z.object({
      taskId: z.string().describe("Task ID that was completed"),
      wentWell: z.array(z.string()).describe("What went well"),
      couldImprove: z.array(z.string()).describe("What could be improved"),
      patternsDiscovered: z
        .array(z.string())
        .optional()
        .describe("New patterns or approaches found"),
      recommendations: z
        .array(z.string())
        .optional()
        .describe("Recommendations for similar tasks"),
      efficiencyScore: z
        .number()
        .min(1)
        .max(10)
        .optional()
        .describe("Self-assessed efficiency (1-10)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      retroId: z.string(),
      path: z.string(),
    }),
    execute: async ({ context }) => {
      const {
        taskId,
        wentWell,
        couldImprove,
        patternsDiscovered,
        recommendations,
        efficiencyScore,
      } = context;
      const workspace = getWorkspace();
      if (!workspace) {
        return { success: false, retroId: "", path: "" };
      }

      const retroDir = join(workspace, ".beads", "retrospectives");
      if (!existsSync(retroDir)) {
        mkdirSync(retroDir, { recursive: true });
      }

      const retroId = `retro-${taskId}-${Date.now()}`;
      const retroPath = join(retroDir, `${retroId}.md`);
      const timestamp = new Date().toISOString();

      const content = `# Retrospective: ${taskId}

**Date:** ${timestamp}
**Efficiency Score:** ${efficiencyScore ?? "N/A"}/10

## What Went Well
${wentWell.map((w) => `- ${w}`).join("\n")}

## What Could Be Improved
${couldImprove.map((c) => `- ${c}`).join("\n")}

${
  patternsDiscovered && patternsDiscovered.length > 0
    ? `## Patterns Discovered
${patternsDiscovered.map((p) => `- ${p}`).join("\n")}
`
    : ""
}
${
  recommendations && recommendations.length > 0
    ? `## Recommendations
${recommendations.map((r) => `- ${r}`).join("\n")}
`
    : ""
}
---
*Generated by Task Runner retrospective*
`;

      try {
        writeFileSync(retroPath, content, "utf-8");

        // Also add patterns to knowledge base
        if (patternsDiscovered) {
          const knowledgePath = join(workspace, "memory", "knowledge.jsonl");
          const memDir = join(workspace, "memory");
          if (!existsSync(memDir)) {
            mkdirSync(memDir, { recursive: true });
          }

          for (const pattern of patternsDiscovered) {
            const entry = {
              id: `kn-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`,
              insight: pattern,
              tags: ["pattern", "retro"],
              taskId,
              timestamp,
            };
            appendFileSync(
              knowledgePath,
              JSON.stringify(entry) + "\n",
              "utf-8",
            );
          }
        }

        return {
          success: true,
          retroId,
          path: retroPath,
        };
      } catch (error) {
        console.error("Retro error:", error);
        return { success: false, retroId: "", path: "" };
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
  createMemoryRecordErrorTool,
  createMemoryRecordLearningTool,
  createMemoryKnowledgeTool,
  createMemoryRecallTool,
  createTaskRetroTool,
];
