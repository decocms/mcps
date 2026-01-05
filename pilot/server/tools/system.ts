/**
 * System Tools
 *
 * Tools for interacting with the local system:
 * - File operations (list, read)
 * - Shell commands
 * - Clipboard
 * - Notifications
 * - Running applications
 */

import { spawn } from "bun";
import { readdir, readFile, stat } from "fs/promises";
import { join, resolve } from "path";

// Safety config
const ALLOWED_PATHS = (process.env.ALLOWED_PATHS || "/Users/guilherme/Projects")
  .split(",")
  .filter(Boolean);
const BLOCKED_COMMANDS = (
  process.env.BLOCKED_COMMANDS || "rm -rf,sudo,chmod 777,mkfs,dd if="
)
  .split(",")
  .filter(Boolean);
const SHELL_TIMEOUT = 30000;

/**
 * Check if a path is within allowed directories
 */
function isPathAllowed(path: string): boolean {
  const resolved = resolve(path);
  return ALLOWED_PATHS.some((allowed) => resolved.startsWith(allowed));
}

/**
 * Check if a command contains blocked patterns
 */
function isCommandBlocked(command: string): string | null {
  for (const pattern of BLOCKED_COMMANDS) {
    if (command.includes(pattern)) {
      return pattern;
    }
  }
  return null;
}

// ============================================================================
// Tool Definitions
// ============================================================================

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}

/**
 * LIST_FILES - List directory contents
 */
export const LIST_FILES: Tool = {
  name: "LIST_FILES",
  description:
    "List files and directories in a path. Returns file names, sizes, and types.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Directory path to list",
      },
    },
    required: ["path"],
  },
  execute: async (args) => {
    const path = args.path as string;

    if (!isPathAllowed(path)) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: `Path not allowed. Allowed: ${ALLOWED_PATHS.join(", ")}`,
            }),
          },
        ],
        isError: true,
      };
    }

    try {
      const entries = await readdir(path, { withFileTypes: true });
      const files = await Promise.all(
        entries
          .filter((e) => !e.name.startsWith("."))
          .slice(0, 50)
          .map(async (entry) => {
            const fullPath = join(path, entry.name);
            try {
              const stats = await stat(fullPath);
              return {
                name: entry.name,
                type: entry.isDirectory() ? "directory" : "file",
                size: stats.size,
                modified: stats.mtime.toISOString(),
              };
            } catch {
              return {
                name: entry.name,
                type: entry.isDirectory() ? "directory" : "file",
              };
            }
          }),
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              path,
              files,
              count: entries.length,
              showing: files.length,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: error instanceof Error ? error.message : "Failed to list",
            }),
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * READ_FILE - Read file contents
 */
export const READ_FILE: Tool = {
  name: "READ_FILE",
  description: "Read the contents of a file. Returns the file content as text.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "File path to read",
      },
      limit: {
        type: "number",
        description: "Maximum lines to read (default: 500)",
      },
    },
    required: ["path"],
  },
  execute: async (args) => {
    const path = args.path as string;
    const limit = (args.limit as number) || 500;

    if (!isPathAllowed(path)) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: `Path not allowed. Allowed: ${ALLOWED_PATHS.join(", ")}`,
            }),
          },
        ],
        isError: true,
      };
    }

    try {
      const content = await readFile(path, "utf-8");
      const lines = content.split("\n");
      const truncated = lines.length > limit;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              path,
              content: lines.slice(0, limit).join("\n"),
              totalLines: lines.length,
              truncated,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: error instanceof Error ? error.message : "Failed to read",
            }),
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * RUN_SHELL - Execute a shell command
 */
export const RUN_SHELL: Tool = {
  name: "RUN_SHELL",
  description:
    "Execute a shell command. Use with caution - dangerous commands are blocked.",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Shell command to execute",
      },
      cwd: {
        type: "string",
        description: "Working directory (default: first allowed path)",
      },
    },
    required: ["command"],
  },
  execute: async (args) => {
    const command = args.command as string;
    const cwd = (args.cwd as string) || ALLOWED_PATHS[0];

    const blocked = isCommandBlocked(command);
    if (blocked) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: `Command blocked: contains "${blocked}"`,
            }),
          },
        ],
        isError: true,
      };
    }

    if (cwd && !isPathAllowed(cwd)) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: "Working directory not allowed" }),
          },
        ],
        isError: true,
      };
    }

    try {
      const proc = spawn(["bash", "-c", command], {
        stdout: "pipe",
        stderr: "pipe",
        cwd,
      });

      // Race between process and timeout
      const timeout = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), SHELL_TIMEOUT),
      );

      const result = await Promise.race([proc.exited, timeout]);

      if (result === null) {
        proc.kill();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: `Command timed out after ${SHELL_TIMEOUT / 1000}s`,
              }),
            },
          ],
          isError: true,
        };
      }

      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              command,
              exitCode: await proc.exited,
              stdout: stdout.slice(0, 5000),
              stderr: stderr.slice(0, 2000),
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error:
                error instanceof Error
                  ? error.message
                  : "Command execution failed",
            }),
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * LIST_APPS - List running applications (macOS)
 */
export const LIST_APPS: Tool = {
  name: "LIST_APPS",
  description: "List currently running applications on macOS",
  inputSchema: {
    type: "object",
    properties: {},
  },
  execute: async () => {
    try {
      const proc = spawn(
        [
          "osascript",
          "-e",
          'tell application "System Events" to get name of every process whose background only is false',
        ],
        { stdout: "pipe", stderr: "pipe" },
      );

      const output = await new Response(proc.stdout).text();
      await proc.exited;

      const apps = output.trim().split(", ").filter(Boolean);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ apps, count: apps.length }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error:
                error instanceof Error ? error.message : "Failed to list apps",
            }),
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * GET_CLIPBOARD - Get clipboard contents
 */
export const GET_CLIPBOARD: Tool = {
  name: "GET_CLIPBOARD",
  description: "Get the current clipboard contents",
  inputSchema: {
    type: "object",
    properties: {},
  },
  execute: async () => {
    try {
      const proc = spawn(["pbpaste"], { stdout: "pipe" });
      const content = await new Response(proc.stdout).text();
      await proc.exited;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              content: content.slice(0, 5000),
              length: content.length,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to get clipboard",
            }),
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * SET_CLIPBOARD - Set clipboard contents
 */
export const SET_CLIPBOARD: Tool = {
  name: "SET_CLIPBOARD",
  description: "Set the clipboard contents",
  inputSchema: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description: "Content to copy to clipboard",
      },
    },
    required: ["content"],
  },
  execute: async (args) => {
    const content = args.content as string;

    try {
      const proc = spawn(["pbcopy"], { stdin: "pipe" });
      proc.stdin.write(content);
      proc.stdin.end();
      await proc.exited;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              length: content.length,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to set clipboard",
            }),
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * SEND_NOTIFICATION - Send a system notification (macOS)
 */
export const SEND_NOTIFICATION: Tool = {
  name: "SEND_NOTIFICATION",
  description: "Send a system notification (macOS)",
  inputSchema: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description: "Notification message",
      },
      title: {
        type: "string",
        description: "Notification title (default: Pilot)",
      },
    },
    required: ["message"],
  },
  execute: async (args) => {
    const message = args.message as string;
    const title = (args.title as string) || "Pilot";

    try {
      const escapedMessage = message.replace(/"/g, '\\"');
      const escapedTitle = title.replace(/"/g, '\\"');

      const proc = spawn(
        [
          "osascript",
          "-e",
          `display notification "${escapedMessage}" with title "${escapedTitle}"`,
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      await proc.exited;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, message, title }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to send notification",
            }),
          },
        ],
        isError: true,
      };
    }
  },
};

// Export all system tools
export const systemTools: Tool[] = [
  LIST_FILES,
  READ_FILE,
  RUN_SHELL,
  LIST_APPS,
  GET_CLIPBOARD,
  SET_CLIPBOARD,
  SEND_NOTIFICATION,
];
