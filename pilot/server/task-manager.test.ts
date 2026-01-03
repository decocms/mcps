/**
 * Task Manager Tests
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  createTask,
  getTask,
  updateTaskStatus,
  addTaskProgress,
  addToolUsed,
  getRecentTasks,
  getTaskSummary,
  cancelTask,
} from "./task-manager.ts";

describe("Task Manager", () => {
  beforeEach(() => {
    // Tasks are stored in a module-level Map, so we create fresh tasks for each test
    // In production, we'd want to add a clear function
  });

  describe("createTask", () => {
    it("creates a task with correct initial values", () => {
      const task = createTask("Test message", "cli");

      expect(task.id).toMatch(/^task_\d{4}-\d{2}-\d{2}_\d{6}_[a-z0-9]+$/);
      expect(task.status).toBe("pending");
      expect(task.source).toBe("cli");
      expect(task.userMessage).toBe("Test message");
      expect(task.progress).toEqual([]);
      expect(task.toolsUsed).toEqual([]);
    });

    it("includes chatId if provided", () => {
      const task = createTask("Test", "whatsapp", "chat123");

      expect(task.chatId).toBe("chat123");
    });

    it("truncates long messages", () => {
      const longMessage = "x".repeat(1000);
      const task = createTask(longMessage, "cli");

      expect(task.userMessage.length).toBe(500);
    });
  });

  describe("getTask", () => {
    it("returns task by ID", () => {
      const created = createTask("Find me", "cli");
      const found = getTask(created.id);

      expect(found).not.toBeNull();
      expect(found?.userMessage).toBe("Find me");
    });

    it("returns null for unknown ID", () => {
      const found = getTask("nonexistent_id");

      expect(found).toBeNull();
    });
  });

  describe("updateTaskStatus", () => {
    it("updates task status", () => {
      const task = createTask("Update me", "cli");
      updateTaskStatus(task.id, "in_progress");

      const updated = getTask(task.id);
      expect(updated?.status).toBe("in_progress");
    });

    it("sets response on completion", () => {
      const task = createTask("Complete me", "cli");
      updateTaskStatus(task.id, "completed", "Done!");

      const updated = getTask(task.id);
      expect(updated?.response).toBe("Done!");
      // Duration might be 0 if test runs very fast, so just check it's defined
      expect(updated?.durationMs).toBeDefined();
    });

    it("sets error on failure", () => {
      const task = createTask("Fail me", "cli");
      updateTaskStatus(task.id, "error", undefined, "Something broke");

      const updated = getTask(task.id);
      expect(updated?.error).toBe("Something broke");
    });
  });

  describe("addTaskProgress", () => {
    it("adds progress entries", () => {
      const task = createTask("Progress me", "cli");
      addTaskProgress(task.id, "Step 1");
      addTaskProgress(task.id, "Step 2");

      const updated = getTask(task.id);
      expect(updated?.progress.length).toBe(2);
      expect(updated?.progress[0].message).toBe("Step 1");
      expect(updated?.progress[1].message).toBe("Step 2");
    });

    it("sets status to in_progress", () => {
      const task = createTask("Progress me", "cli");
      addTaskProgress(task.id, "Working...");

      const updated = getTask(task.id);
      expect(updated?.status).toBe("in_progress");
    });
  });

  describe("addToolUsed", () => {
    it("adds tools to the list", () => {
      const task = createTask("Use tools", "cli");
      addToolUsed(task.id, "LIST_FILES");
      addToolUsed(task.id, "READ_FILE");

      const updated = getTask(task.id);
      expect(updated?.toolsUsed).toContain("LIST_FILES");
      expect(updated?.toolsUsed).toContain("READ_FILE");
    });

    it("does not duplicate tools", () => {
      const task = createTask("Use tools", "cli");
      addToolUsed(task.id, "LIST_FILES");
      addToolUsed(task.id, "LIST_FILES");

      const updated = getTask(task.id);
      expect(updated?.toolsUsed.filter((t) => t === "LIST_FILES").length).toBe(
        1,
      );
    });
  });

  describe("getRecentTasks", () => {
    it("returns tasks sorted by creation time (newest first)", () => {
      // Create tasks - since they may have the same timestamp,
      // we just verify we get them all back and sorted by time
      const t1 = createTask("SortTest_A", "cli");
      const t2 = createTask("SortTest_B", "cli");
      const t3 = createTask("SortTest_C", "cli");

      const recent = getRecentTasks(100);
      const sortTestTasks = recent.filter((t) =>
        t.userMessage.startsWith("SortTest_"),
      );

      // All 3 tasks should be present
      expect(sortTestTasks.length).toBeGreaterThanOrEqual(3);

      // Tasks should be sorted by createdAt (descending)
      for (let i = 0; i < sortTestTasks.length - 1; i++) {
        const current = new Date(sortTestTasks[i].createdAt).getTime();
        const next = new Date(sortTestTasks[i + 1].createdAt).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });

    it("respects limit", () => {
      createTask("A", "cli");
      createTask("B", "cli");
      createTask("C", "cli");

      const recent = getRecentTasks(2);
      expect(recent.length).toBe(2);
    });

    it("filters by status", () => {
      const t1 = createTask("Completed", "cli");
      updateTaskStatus(t1.id, "completed");

      const t2 = createTask("In progress", "cli");
      updateTaskStatus(t2.id, "in_progress");

      const completed = getRecentTasks(10, "completed");
      expect(completed.every((t) => t.status === "completed")).toBe(true);
    });
  });

  describe("getTaskSummary", () => {
    it("returns correct counts", () => {
      const t1 = createTask("Done", "cli");
      updateTaskStatus(t1.id, "completed");

      const t2 = createTask("Working", "cli");
      updateTaskStatus(t2.id, "in_progress");

      const t3 = createTask("Failed", "cli");
      updateTaskStatus(t3.id, "error");

      const summary = getTaskSummary();
      expect(summary.completed).toBeGreaterThanOrEqual(1);
      expect(summary.inProgress).toBeGreaterThanOrEqual(1);
      expect(summary.error).toBeGreaterThanOrEqual(1);
    });

    it("includes recent tasks preview", () => {
      createTask("Preview me", "cli");

      const summary = getTaskSummary();
      expect(summary.recentTasks.length).toBeGreaterThan(0);
      expect(summary.recentTasks[0]).toHaveProperty("id");
      expect(summary.recentTasks[0]).toHaveProperty("status");
      expect(summary.recentTasks[0]).toHaveProperty("message");
      expect(summary.recentTasks[0]).toHaveProperty("age");
    });
  });

  describe("cancelTask", () => {
    it("cancels pending tasks", () => {
      const task = createTask("Cancel me", "cli");
      const success = cancelTask(task.id);

      expect(success).toBe(true);
      expect(getTask(task.id)?.status).toBe("cancelled");
    });

    it("cancels in_progress tasks", () => {
      const task = createTask("Cancel me", "cli");
      updateTaskStatus(task.id, "in_progress");
      const success = cancelTask(task.id);

      expect(success).toBe(true);
      expect(getTask(task.id)?.status).toBe("cancelled");
    });

    it("cannot cancel completed tasks", () => {
      const task = createTask("Done", "cli");
      updateTaskStatus(task.id, "completed");
      const success = cancelTask(task.id);

      expect(success).toBe(false);
      expect(getTask(task.id)?.status).toBe("completed");
    });

    it("returns false for unknown ID", () => {
      const success = cancelTask("nonexistent");
      expect(success).toBe(false);
    });
  });
});
