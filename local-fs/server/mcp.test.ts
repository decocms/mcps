/**
 * MCP Server Integration Tests
 *
 * Tests for the MCP server tools and protocol integration.
 * Uses the actual registerTools function to test the real implementation.
 */

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LocalFileStorage } from "./storage.js";
import { registerTools } from "./tools.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("MCP Server Integration", () => {
  let tempDir: string;
  let storage: LocalFileStorage;
  let server: McpServer;
  let client: Client;

  beforeAll(async () => {
    // Create temp directory
    tempDir = await mkdtemp(join(tmpdir(), "mcp-server-test-"));
    storage = new LocalFileStorage(tempDir);

    // Create MCP server with shared tools
    server = new McpServer({
      name: "local-fs",
      version: "1.0.0",
    });
    registerTools(server, storage);

    // Create in-memory transport pair
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    // Connect server and client
    await server.connect(serverTransport);

    client = new Client({
      name: "test-client",
      version: "1.0.0",
    });
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client.close();
    await server.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    // Clean the temp directory before each test
    const entries = await storage.list("");
    for (const entry of entries) {
      await rm(join(tempDir, entry.path), { recursive: true, force: true });
    }
  });

  describe("tools/list", () => {
    test("should list all official MCP filesystem tools", async () => {
      const result = await client.listTools();

      expect(result.tools.length).toBeGreaterThan(0);

      const toolNames = result.tools.map((t) => t.name);

      // Official MCP filesystem tools
      expect(toolNames).toContain("read_file");
      expect(toolNames).toContain("read_text_file");
      expect(toolNames).toContain("read_media_file");
      expect(toolNames).toContain("read_multiple_files");
      expect(toolNames).toContain("write_file");
      expect(toolNames).toContain("edit_file");
      expect(toolNames).toContain("create_directory");
      expect(toolNames).toContain("list_directory");
      expect(toolNames).toContain("list_directory_with_sizes");
      expect(toolNames).toContain("directory_tree");
      expect(toolNames).toContain("move_file");
      expect(toolNames).toContain("search_files");
      expect(toolNames).toContain("get_file_info");
      expect(toolNames).toContain("list_allowed_directories");

      // Additional tools
      expect(toolNames).toContain("delete_file");
      expect(toolNames).toContain("copy_file");

      // Mesh collection bindings
      expect(toolNames).toContain("COLLECTION_FILES_LIST");
      expect(toolNames).toContain("COLLECTION_FILES_GET");
      expect(toolNames).toContain("COLLECTION_FOLDERS_LIST");
      expect(toolNames).toContain("COLLECTION_FOLDERS_GET");
    });

    test("each tool should have a description", async () => {
      const result = await client.listTools();

      for (const tool of result.tools) {
        expect(tool.description).toBeDefined();
        expect(tool.description!.length).toBeGreaterThan(0);
      }
    });
  });

  describe("write_file tool", () => {
    test("should write a file successfully", async () => {
      const result = await client.callTool({
        name: "write_file",
        arguments: {
          path: "test-write.txt",
          content: "Hello from MCP!",
        },
      });

      expect(result.isError).toBeFalsy();
      expect(result.content).toBeDefined();

      // Verify file was written
      const readResult = await storage.read("test-write.txt");
      expect(readResult.content).toBe("Hello from MCP!");
    });

    test("should create nested directories", async () => {
      const result = await client.callTool({
        name: "write_file",
        arguments: {
          path: "nested/path/file.txt",
          content: "Nested content",
        },
      });

      expect(result.isError).toBeFalsy();

      const readResult = await storage.read("nested/path/file.txt");
      expect(readResult.content).toBe("Nested content");
    });
  });

  describe("read_text_file tool", () => {
    test("should read a file successfully", async () => {
      await storage.write("read-test.txt", "Content to read");

      const result = await client.callTool({
        name: "read_text_file",
        arguments: {
          path: "read-test.txt",
        },
      });

      expect(result.isError).toBeFalsy();

      const textContent = result.content as Array<{
        type: string;
        text: string;
      }>;
      expect(textContent[0].text).toBe("Content to read");
    });

    test("should return error for non-existent file", async () => {
      const result = await client.callTool({
        name: "read_text_file",
        arguments: {
          path: "does-not-exist.txt",
        },
      });

      expect(result.isError).toBe(true);
      const textContent = result.content as Array<{
        type: string;
        text: string;
      }>;
      expect(textContent[0].text).toContain("Error:");
    });

    test("should support head parameter", async () => {
      await storage.write(
        "lines.txt",
        "Line 1\nLine 2\nLine 3\nLine 4\nLine 5",
      );

      const result = await client.callTool({
        name: "read_text_file",
        arguments: {
          path: "lines.txt",
          head: 2,
        },
      });

      expect(result.isError).toBeFalsy();

      const textContent = result.content as Array<{
        type: string;
        text: string;
      }>;
      expect(textContent[0].text).toBe("Line 1\nLine 2");
    });

    test("should support tail parameter", async () => {
      await storage.write(
        "lines.txt",
        "Line 1\nLine 2\nLine 3\nLine 4\nLine 5",
      );

      const result = await client.callTool({
        name: "read_text_file",
        arguments: {
          path: "lines.txt",
          tail: 2,
        },
      });

      expect(result.isError).toBeFalsy();

      const textContent = result.content as Array<{
        type: string;
        text: string;
      }>;
      expect(textContent[0].text).toBe("Line 4\nLine 5");
    });
  });

  describe("read_multiple_files tool", () => {
    test("should read multiple files at once", async () => {
      await storage.write("file1.txt", "Content 1");
      await storage.write("file2.txt", "Content 2");

      const result = await client.callTool({
        name: "read_multiple_files",
        arguments: {
          paths: ["file1.txt", "file2.txt"],
        },
      });

      expect(result.isError).toBeFalsy();

      const textContent = result.content as Array<{
        type: string;
        text: string;
      }>;
      expect(textContent[0].text).toContain("file1.txt:");
      expect(textContent[0].text).toContain("Content 1");
      expect(textContent[0].text).toContain("file2.txt:");
      expect(textContent[0].text).toContain("Content 2");
    });
  });

  describe("delete_file tool", () => {
    test("should delete a file", async () => {
      await storage.write("to-delete.txt", "Delete me");

      const result = await client.callTool({
        name: "delete_file",
        arguments: {
          path: "to-delete.txt",
        },
      });

      expect(result.isError).toBeFalsy();

      // Verify file was deleted
      await expect(storage.getMetadata("to-delete.txt")).rejects.toThrow();
    });

    test("should delete directory recursively", async () => {
      await storage.write("dir-delete/file.txt", "content");

      const result = await client.callTool({
        name: "delete_file",
        arguments: {
          path: "dir-delete",
          recursive: true,
        },
      });

      expect(result.isError).toBeFalsy();

      await expect(storage.getMetadata("dir-delete")).rejects.toThrow();
    });
  });

  describe("list_directory tool", () => {
    test("should list files and directories", async () => {
      await storage.write("file.txt", "content");
      await storage.mkdir("subdir");

      const result = await client.callTool({
        name: "list_directory",
        arguments: {
          path: "",
        },
      });

      expect(result.isError).toBeFalsy();

      const textContent = result.content as Array<{
        type: string;
        text: string;
      }>;
      expect(textContent[0].text).toContain("[FILE] file.txt");
      expect(textContent[0].text).toContain("[DIR] subdir");
    });
  });

  describe("create_directory tool", () => {
    test("should create a directory", async () => {
      const result = await client.callTool({
        name: "create_directory",
        arguments: {
          path: "new-dir",
        },
      });

      expect(result.isError).toBeFalsy();

      const meta = await storage.getMetadata("new-dir");
      expect(meta.isDirectory).toBe(true);
    });

    test("should create nested directories", async () => {
      const result = await client.callTool({
        name: "create_directory",
        arguments: {
          path: "deep/nested/dir",
        },
      });

      expect(result.isError).toBeFalsy();

      const meta = await storage.getMetadata("deep/nested/dir");
      expect(meta.isDirectory).toBe(true);
    });
  });

  describe("move_file tool", () => {
    test("should move a file", async () => {
      await storage.write("original.txt", "content");

      const result = await client.callTool({
        name: "move_file",
        arguments: {
          source: "original.txt",
          destination: "moved.txt",
        },
      });

      expect(result.isError).toBeFalsy();

      await expect(storage.getMetadata("original.txt")).rejects.toThrow();
      const content = await storage.read("moved.txt");
      expect(content.content).toBe("content");
    });
  });

  describe("copy_file tool", () => {
    test("should copy a file", async () => {
      await storage.write("original.txt", "content");

      const result = await client.callTool({
        name: "copy_file",
        arguments: {
          source: "original.txt",
          destination: "copy.txt",
        },
      });

      expect(result.isError).toBeFalsy();

      const original = await storage.read("original.txt");
      const copy = await storage.read("copy.txt");
      expect(original.content).toBe("content");
      expect(copy.content).toBe("content");
    });
  });

  describe("get_file_info tool", () => {
    test("should return file metadata", async () => {
      await storage.write("info-test.txt", "some content");

      const result = await client.callTool({
        name: "get_file_info",
        arguments: {
          path: "info-test.txt",
        },
      });

      expect(result.isError).toBeFalsy();

      const textContent = result.content as Array<{
        type: string;
        text: string;
      }>;
      expect(textContent[0].text).toContain("type: file");
      expect(textContent[0].text).toContain("size:");
    });
  });

  describe("search_files tool", () => {
    test("should find files matching pattern", async () => {
      await storage.write("test.txt", "content");
      await storage.write("test.js", "content");
      await storage.write("other.md", "content");

      const result = await client.callTool({
        name: "search_files",
        arguments: {
          path: "",
          pattern: "*.txt",
        },
      });

      expect(result.isError).toBeFalsy();

      const textContent = result.content as Array<{
        type: string;
        text: string;
      }>;
      expect(textContent[0].text).toContain("test.txt");
      expect(textContent[0].text).not.toContain("test.js");
    });
  });

  describe("edit_file tool", () => {
    test("should edit file with search and replace", async () => {
      await storage.write("edit-test.txt", "Hello World");

      const result = await client.callTool({
        name: "edit_file",
        arguments: {
          path: "edit-test.txt",
          edits: [{ oldText: "World", newText: "MCP" }],
        },
      });

      expect(result.isError).toBeFalsy();

      const content = await storage.read("edit-test.txt");
      expect(content.content).toBe("Hello MCP");
    });

    test("should support dry run", async () => {
      await storage.write("edit-test.txt", "Hello World");

      const result = await client.callTool({
        name: "edit_file",
        arguments: {
          path: "edit-test.txt",
          edits: [{ oldText: "World", newText: "MCP" }],
          dryRun: true,
        },
      });

      expect(result.isError).toBeFalsy();

      // File should not be changed
      const content = await storage.read("edit-test.txt");
      expect(content.content).toBe("Hello World");

      // Response should include diff preview
      const textContent = result.content as Array<{
        type: string;
        text: string;
      }>;
      expect(textContent[0].text).toContain("Dry run");
    });
  });

  describe("COLLECTION_FILES_LIST tool", () => {
    test("should list files in root", async () => {
      await storage.write("file1.txt", "content1");
      await storage.write("file2.txt", "content2");

      const result = await client.callTool({
        name: "COLLECTION_FILES_LIST",
        arguments: {},
      });

      expect(result.isError).toBeFalsy();

      const textContent = result.content as Array<{
        type: string;
        text: string;
      }>;
      const parsed = JSON.parse(textContent[0].text);

      expect(parsed.items.length).toBe(2);
      expect(parsed.totalCount).toBe(2);
    });

    test("should list files recursively", async () => {
      await storage.write("root.txt", "root");
      await storage.write("sub/nested.txt", "nested");

      const result = await client.callTool({
        name: "COLLECTION_FILES_LIST",
        arguments: {
          recursive: true,
        },
      });

      expect(result.isError).toBeFalsy();

      const textContent = result.content as Array<{
        type: string;
        text: string;
      }>;
      const parsed = JSON.parse(textContent[0].text);

      expect(parsed.items.length).toBe(2);
      const paths = parsed.items.map((i: { path: string }) => i.path);
      expect(paths).toContain("root.txt");
      expect(paths).toContain("sub/nested.txt");
    });

    test("should respect limit parameter", async () => {
      await storage.write("file1.txt", "1");
      await storage.write("file2.txt", "2");
      await storage.write("file3.txt", "3");

      const result = await client.callTool({
        name: "COLLECTION_FILES_LIST",
        arguments: {
          limit: 2,
        },
      });

      expect(result.isError).toBeFalsy();

      const textContent = result.content as Array<{
        type: string;
        text: string;
      }>;
      const parsed = JSON.parse(textContent[0].text);

      expect(parsed.items.length).toBe(2);
      expect(parsed.totalCount).toBe(3);
      expect(parsed.hasMore).toBe(true);
    });
  });

  describe("COLLECTION_FOLDERS_LIST tool", () => {
    test("should list folders", async () => {
      await storage.mkdir("folder1");
      await storage.mkdir("folder2");
      await storage.write("file.txt", "content");

      const result = await client.callTool({
        name: "COLLECTION_FOLDERS_LIST",
        arguments: {},
      });

      expect(result.isError).toBeFalsy();

      const textContent = result.content as Array<{
        type: string;
        text: string;
      }>;
      const parsed = JSON.parse(textContent[0].text);

      expect(parsed.items.length).toBe(2);
      expect(
        parsed.items.every((i: { isDirectory: boolean }) => i.isDirectory),
      ).toBe(true);
    });
  });

  describe("COLLECTION_FILES_GET tool", () => {
    test("should return file metadata and content", async () => {
      await storage.write("get-test.txt", "Hello from GET test!");

      const result = await client.callTool({
        name: "COLLECTION_FILES_GET",
        arguments: { id: "get-test.txt" },
      });

      expect(result.isError).toBeFalsy();

      const textContent = result.content as Array<{
        type: string;
        text: string;
      }>;
      const parsed = JSON.parse(textContent[0].text);

      expect(parsed.item).toBeDefined();
      expect(parsed.item.path).toBe("get-test.txt");
      expect(parsed.item.content).toBe("Hello from GET test!");
      expect(parsed.item.isDirectory).toBe(false);
    });
  });

  describe("list_allowed_directories tool", () => {
    test("should return the root directory", async () => {
      const result = await client.callTool({
        name: "list_allowed_directories",
        arguments: {},
      });

      expect(result.isError).toBeFalsy();

      const textContent = result.content as Array<{
        type: string;
        text: string;
      }>;
      expect(textContent[0].text).toContain(tempDir);
    });
  });

  describe("error handling", () => {
    test("should handle invalid file paths gracefully", async () => {
      const result = await client.callTool({
        name: "read_text_file",
        arguments: {
          path: "",
        },
      });

      // Should return an error response, not throw
      expect(result.isError).toBe(true);
    });
  });
});
