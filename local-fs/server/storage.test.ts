/**
 * Storage Layer Tests
 *
 * Tests for the LocalFileStorage class - file system operations.
 */

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { LocalFileStorage, getExtensionFromMimeType } from "./storage.js";
import { Readable } from "node:stream";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("LocalFileStorage", () => {
  let tempDir: string;
  let storage: LocalFileStorage;

  beforeAll(async () => {
    // Create a temp directory for tests
    tempDir = await mkdtemp(join(tmpdir(), "mcp-local-fs-test-"));
    storage = new LocalFileStorage(tempDir);
  });

  afterAll(async () => {
    // Clean up temp directory
    await rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    // Clean the temp directory before each test
    const entries = await storage.list("");
    for (const entry of entries) {
      await rm(join(tempDir, entry.path), { recursive: true, force: true });
    }
  });

  describe("root property", () => {
    test("should return the resolved root directory", () => {
      expect(storage.root).toBe(tempDir);
    });
  });

  describe("write and read", () => {
    test("should write and read a text file", async () => {
      const content = "Hello, World!";
      await storage.write("test.txt", content);

      const result = await storage.read("test.txt");
      expect(result.content).toBe(content);
      expect(result.metadata.path).toBe("test.txt");
      expect(result.metadata.mimeType).toBe("text/plain");
    });

    test("should write and read a file with utf-8 encoding", async () => {
      const content = "こんにちは世界 🌍";
      await storage.write("unicode.txt", content, { encoding: "utf-8" });

      const result = await storage.read("unicode.txt", "utf-8");
      expect(result.content).toBe(content);
    });

    test("should write and read a file with base64 encoding", async () => {
      const originalContent = "Binary test content";
      const base64Content = Buffer.from(originalContent).toString("base64");

      await storage.write("binary.bin", base64Content, { encoding: "base64" });

      const result = await storage.read("binary.bin", "base64");
      const decodedContent = Buffer.from(result.content, "base64").toString(
        "utf-8",
      );
      expect(decodedContent).toBe(originalContent);
    });

    test("should create parent directories when writing", async () => {
      const content = "Nested file";
      await storage.write("nested/deep/file.txt", content, {
        createParents: true,
      });

      const result = await storage.read("nested/deep/file.txt");
      expect(result.content).toBe(content);
    });

    test("should fail to overwrite when overwrite is false", async () => {
      await storage.write("existing.txt", "original");

      await expect(
        storage.write("existing.txt", "new content", { overwrite: false }),
      ).rejects.toThrow("File already exists");
    });

    test("should overwrite when overwrite is true", async () => {
      await storage.write("overwrite.txt", "original");
      await storage.write("overwrite.txt", "updated", { overwrite: true });

      const result = await storage.read("overwrite.txt");
      expect(result.content).toBe("updated");
    });
  });

  describe("getMetadata", () => {
    test("should return metadata for a file", async () => {
      await storage.write("meta-test.txt", "content");

      const metadata = await storage.getMetadata("meta-test.txt");
      expect(metadata.id).toBe("meta-test.txt");
      expect(metadata.title).toBe("meta-test.txt");
      expect(metadata.isDirectory).toBe(false);
      expect(metadata.mimeType).toBe("text/plain");
      expect(metadata.size).toBeGreaterThan(0);
      expect(metadata.created_at).toBeDefined();
      expect(metadata.updated_at).toBeDefined();
    });

    test("should return metadata for a directory", async () => {
      await storage.mkdir("test-dir");

      const metadata = await storage.getMetadata("test-dir");
      expect(metadata.isDirectory).toBe(true);
      expect(metadata.mimeType).toBe("inode/directory");
    });

    test("should throw for non-existent path", async () => {
      await expect(storage.getMetadata("does-not-exist.txt")).rejects.toThrow();
    });
  });

  describe("list", () => {
    test("should list files in root directory", async () => {
      await storage.write("file1.txt", "content1");
      await storage.write("file2.txt", "content2");

      const items = await storage.list("");
      expect(items.length).toBe(2);
      expect(items.map((i) => i.title)).toContain("file1.txt");
      expect(items.map((i) => i.title)).toContain("file2.txt");
    });

    test("should list files in subdirectory", async () => {
      await storage.mkdir("subdir");
      await storage.write("subdir/nested.txt", "nested content");

      const items = await storage.list("subdir");
      expect(items.length).toBe(1);
      expect(items[0].title).toBe("subdir/nested.txt");
    });

    test("should list recursively when recursive=true", async () => {
      await storage.write("root.txt", "root");
      await storage.write("level1/file1.txt", "level1");
      await storage.write("level1/level2/file2.txt", "level2");

      const items = await storage.list("", { recursive: true });
      const paths = items.map((i) => i.path);

      expect(paths).toContain("root.txt");
      expect(paths).toContain("level1/file1.txt");
      expect(paths).toContain("level1/level2/file2.txt");
    });

    test("should filter to files only when filesOnly=true", async () => {
      await storage.mkdir("dir-only");
      await storage.write("file-only.txt", "content");

      const items = await storage.list("", { filesOnly: true });
      expect(items.every((i) => !i.isDirectory)).toBe(true);
      expect(items.map((i) => i.title)).toContain("file-only.txt");
    });

    test("should return empty array for non-existent directory", async () => {
      const items = await storage.list("non-existent");
      expect(items).toEqual([]);
    });

    test("should skip hidden files (starting with .)", async () => {
      await writeFile(join(tempDir, ".hidden"), "hidden content");
      await storage.write("visible.txt", "visible content");

      const items = await storage.list("");
      expect(items.map((i) => i.title)).not.toContain(".hidden");
      expect(items.map((i) => i.title)).toContain("visible.txt");
    });
  });

  describe("mkdir", () => {
    test("should create a directory", async () => {
      const result = await storage.mkdir("new-dir");

      expect(result.folder.isDirectory).toBe(true);
      expect(result.folder.path).toBe("new-dir");
    });

    test("should create nested directories with recursive=true", async () => {
      const result = await storage.mkdir("a/b/c", true);

      expect(result.folder.path).toBe("a/b/c");

      const metadata = await storage.getMetadata("a/b/c");
      expect(metadata.isDirectory).toBe(true);
    });
  });

  describe("delete", () => {
    test("should delete a file", async () => {
      await storage.write("to-delete.txt", "content");
      const result = await storage.delete("to-delete.txt");

      expect(result.success).toBe(true);
      await expect(storage.getMetadata("to-delete.txt")).rejects.toThrow();
    });

    test("should delete an empty directory", async () => {
      await storage.mkdir("empty-dir");
      const result = await storage.delete("empty-dir", true);

      expect(result.success).toBe(true);
    });

    test("should delete directory recursively", async () => {
      await storage.write("dir-to-delete/file.txt", "content");
      const result = await storage.delete("dir-to-delete", true);

      expect(result.success).toBe(true);
      await expect(storage.getMetadata("dir-to-delete")).rejects.toThrow();
    });

    test("should fail to delete non-empty directory without recursive flag", async () => {
      await storage.write("non-empty/file.txt", "content");

      await expect(storage.delete("non-empty", false)).rejects.toThrow();
    });
  });

  describe("move", () => {
    test("should move a file", async () => {
      await storage.write("source.txt", "content");
      const result = await storage.move("source.txt", "destination.txt");

      expect(result.file.path).toBe("destination.txt");
      await expect(storage.getMetadata("source.txt")).rejects.toThrow();

      const content = await storage.read("destination.txt");
      expect(content.content).toBe("content");
    });

    test("should move a file to a subdirectory", async () => {
      await storage.write("move-me.txt", "content");
      await storage.mkdir("target-dir");
      await storage.move("move-me.txt", "target-dir/moved.txt");

      const content = await storage.read("target-dir/moved.txt");
      expect(content.content).toBe("content");
    });

    test("should fail to overwrite without overwrite flag", async () => {
      await storage.write("existing-dest.txt", "existing");
      await storage.write("new-source.txt", "new");

      await expect(
        storage.move("new-source.txt", "existing-dest.txt", false),
      ).rejects.toThrow("Destination already exists");
    });

    test("should overwrite with overwrite flag", async () => {
      await storage.write("old.txt", "old content");
      await storage.write("new.txt", "new content");
      await storage.move("new.txt", "old.txt", true);

      const result = await storage.read("old.txt");
      expect(result.content).toBe("new content");
    });
  });

  describe("copy", () => {
    test("should copy a file", async () => {
      await storage.write("original.txt", "content");
      const result = await storage.copy("original.txt", "copied.txt");

      expect(result.file.path).toBe("copied.txt");

      // Both files should exist
      const original = await storage.read("original.txt");
      const copied = await storage.read("copied.txt");
      expect(original.content).toBe("content");
      expect(copied.content).toBe("content");
    });

    test("should fail to overwrite without overwrite flag", async () => {
      await storage.write("src.txt", "source");
      await storage.write("dst.txt", "destination");

      await expect(storage.copy("src.txt", "dst.txt", false)).rejects.toThrow(
        "Destination already exists",
      );
    });

    test("should overwrite with overwrite flag", async () => {
      await storage.write("src.txt", "source content");
      await storage.write("dst.txt", "destination content");
      await storage.copy("src.txt", "dst.txt", true);

      const result = await storage.read("dst.txt");
      expect(result.content).toBe("source content");
    });
  });

  describe("path sanitization", () => {
    test("should prevent path traversal with ..", async () => {
      await storage.write("safe.txt", "safe content");

      // Attempting to traverse should be sanitized
      const result = await storage.read("../safe.txt");
      // This should still find the file since .. is stripped
      expect(result.content).toBe("safe content");
    });

    test("should handle leading slashes", async () => {
      await storage.write("leading-slash.txt", "content");

      const result = await storage.read("/leading-slash.txt");
      expect(result.content).toBe("content");
    });
  });

  describe("path normalization (stripping root prefix)", () => {
    test("should strip root directory prefix from path", async () => {
      await storage.write("normalize-test.txt", "normalized content");

      // AI agents sometimes pass the full path including root
      const fullPath = `${tempDir}/normalize-test.txt`;
      const result = await storage.read(fullPath);
      expect(result.content).toBe("normalized content");
    });

    test("should strip root with colon separator", async () => {
      await storage.write("colon-test.txt", "colon content");

      // Some tools format paths as "root:filename"
      const colonPath = `${tempDir}:colon-test.txt`;
      const result = await storage.read(colonPath);
      expect(result.content).toBe("colon content");
    });

    test("normalizePath should return relative path", () => {
      const relPath = storage.normalizePath(`${tempDir}/some/file.txt`);
      expect(relPath).toBe("some/file.txt");
    });

    test("normalizePath should handle already-relative paths", () => {
      const relPath = storage.normalizePath("some/file.txt");
      expect(relPath).toBe("some/file.txt");
    });

    test("normalizePath should handle colon separator", () => {
      const relPath = storage.normalizePath(`${tempDir}:file.txt`);
      expect(relPath).toBe("file.txt");
    });

    test("normalizePath should strip leading slashes", () => {
      const relPath = storage.normalizePath("/file.txt");
      expect(relPath).toBe("file.txt");
    });

    test("normalizePath should NOT match paths that share prefix but are not inside root", () => {
      // If rootDir is /tmp/root, a path like /tmp/rootEvil/file.txt should NOT
      // be treated as inside the root directory
      const relPath = storage.normalizePath(`${tempDir}Evil/file.txt`);
      // Should return the full path unchanged (minus leading slash stripping)
      expect(relPath).not.toBe("Evil/file.txt");
      // Instead it should be the original path with leading slash stripped
      expect(relPath).toContain("Evil/file.txt");
    });
  });

  describe("MIME type detection", () => {
    const testCases = [
      { ext: ".txt", expected: "text/plain" },
      { ext: ".json", expected: "application/json" },
      { ext: ".html", expected: "text/html" },
      { ext: ".css", expected: "text/css" },
      { ext: ".js", expected: "application/javascript" },
      { ext: ".ts", expected: "text/typescript" },
      { ext: ".md", expected: "text/markdown" },
      { ext: ".png", expected: "image/png" },
      { ext: ".jpg", expected: "image/jpeg" },
      { ext: ".pdf", expected: "application/pdf" },
      { ext: ".unknown", expected: "application/octet-stream" },
    ];

    for (const { ext, expected } of testCases) {
      test(`should detect ${expected} for ${ext} files`, async () => {
        await storage.write(`file${ext}`, "content");
        const metadata = await storage.getMetadata(`file${ext}`);
        expect(metadata.mimeType).toBe(expected);
      });
    }
  });

  describe("writeStream", () => {
    test("should stream content to file", async () => {
      const content = "Hello from stream!";
      const chunks = [Buffer.from(content)];

      const stream = new Readable({
        read() {
          const chunk = chunks.shift();
          this.push(chunk ?? null);
        },
      });

      const result = await storage.writeStream("stream-test.txt", stream);

      expect(result.bytesWritten).toBe(content.length);
      expect(result.file.path).toBe("stream-test.txt");

      const readBack = await storage.read("stream-test.txt");
      expect(readBack.content).toBe(content);
    });

    test("should stream large content without buffering", async () => {
      // Create a 1MB stream in chunks
      const chunkSize = 64 * 1024; // 64KB chunks
      const totalSize = 1024 * 1024; // 1MB
      let bytesGenerated = 0;

      const stream = new Readable({
        read() {
          if (bytesGenerated >= totalSize) {
            this.push(null);
            return;
          }
          const size = Math.min(chunkSize, totalSize - bytesGenerated);
          const chunk = Buffer.alloc(size, "x");
          bytesGenerated += size;
          this.push(chunk);
        },
      });

      const result = await storage.writeStream("large-stream.bin", stream);

      expect(result.bytesWritten).toBe(totalSize);

      const metadata = await storage.getMetadata("large-stream.bin");
      expect(metadata.size).toBe(totalSize);
    });

    test("should create parent directories", async () => {
      const stream = Readable.from([Buffer.from("nested content")]);

      const result = await storage.writeStream(
        "deep/nested/path/file.txt",
        stream,
        { createParents: true },
      );

      expect(result.file.path).toBe("deep/nested/path/file.txt");

      const readBack = await storage.read("deep/nested/path/file.txt");
      expect(readBack.content).toBe("nested content");
    });

    test("should fail if file exists and overwrite is false", async () => {
      await storage.write("existing-stream.txt", "existing");

      const stream = Readable.from([Buffer.from("new content")]);

      await expect(
        storage.writeStream("existing-stream.txt", stream, {
          overwrite: false,
        }),
      ).rejects.toThrow("File already exists");
    });

    test("should overwrite if overwrite is true", async () => {
      await storage.write("overwrite-stream.txt", "old");

      const stream = Readable.from([Buffer.from("new content")]);
      await storage.writeStream("overwrite-stream.txt", stream, {
        overwrite: true,
      });

      const readBack = await storage.read("overwrite-stream.txt");
      expect(readBack.content).toBe("new content");
    });
  });
});

describe("getExtensionFromMimeType", () => {
  test("should return extension for known MIME types", () => {
    expect(getExtensionFromMimeType("application/json")).toBe(".json");
    expect(getExtensionFromMimeType("image/png")).toBe(".png");
    expect(getExtensionFromMimeType("text/plain")).toBe(".txt");
    // .htm is shorter than .html so it's preferred
    expect(getExtensionFromMimeType("text/html")).toBe(".htm");
    expect(getExtensionFromMimeType("application/pdf")).toBe(".pdf");
  });

  test("should handle MIME types with charset", () => {
    expect(getExtensionFromMimeType("application/json; charset=utf-8")).toBe(
      ".json",
    );
    expect(getExtensionFromMimeType("text/html; charset=UTF-8")).toBe(".htm");
  });

  test("should return .ndjson for newline-delimited JSON", () => {
    expect(getExtensionFromMimeType("application/x-ndjson")).toBe(".ndjson");
    expect(getExtensionFromMimeType("application/jsonl")).toBe(".jsonl");
  });

  test("should return empty string for unknown MIME types", () => {
    expect(getExtensionFromMimeType("application/x-unknown-format")).toBe("");
  });

  test("should return .bin for octet-stream", () => {
    expect(getExtensionFromMimeType("application/octet-stream")).toBe(".bin");
  });
});
