/**
 * Events Tests
 */

import { describe, it, expect } from "bun:test";
import {
  EVENT_TYPES,
  getResponseEventType,
  UserMessageEventSchema,
  TaskCompletedEventSchema,
} from "./events.ts";

describe("Event Types", () => {
  describe("EVENT_TYPES", () => {
    it("has correct user event types", () => {
      expect(EVENT_TYPES.USER_MESSAGE).toBe("user.message.received");
    });

    it("has correct task event types", () => {
      expect(EVENT_TYPES.TASK_CREATED).toBe("agent.task.created");
      expect(EVENT_TYPES.TASK_STARTED).toBe("agent.task.started");
      expect(EVENT_TYPES.TASK_PROGRESS).toBe("agent.task.progress");
      expect(EVENT_TYPES.TASK_COMPLETED).toBe("agent.task.completed");
      expect(EVENT_TYPES.TASK_FAILED).toBe("agent.task.failed");
    });
  });

  describe("getResponseEventType", () => {
    it("builds correct event type for whatsapp", () => {
      expect(getResponseEventType("whatsapp")).toBe("agent.response.whatsapp");
    });

    it("builds correct event type for cli", () => {
      expect(getResponseEventType("cli")).toBe("agent.response.cli");
    });

    it("handles custom sources", () => {
      expect(getResponseEventType("raycast")).toBe("agent.response.raycast");
    });
  });
});

describe("Event Schemas", () => {
  describe("UserMessageEventSchema", () => {
    it("validates minimal message", () => {
      const result = UserMessageEventSchema.safeParse({
        text: "Hello",
        source: "cli",
      });

      expect(result.success).toBe(true);
      expect(result.data?.text).toBe("Hello");
      expect(result.data?.source).toBe("cli");
    });

    it("validates full message with all fields", () => {
      const result = UserMessageEventSchema.safeParse({
        text: "Hello",
        source: "whatsapp",
        chatId: "chat123",
        sender: { id: "user1", name: "John" },
        replyTo: "msg123",
        metadata: { isGroup: true },
      });

      expect(result.success).toBe(true);
      expect(result.data?.chatId).toBe("chat123");
      expect(result.data?.sender?.name).toBe("John");
    });

    it("rejects message without text", () => {
      const result = UserMessageEventSchema.safeParse({
        source: "cli",
      });

      expect(result.success).toBe(false);
    });

    it("rejects message without source", () => {
      const result = UserMessageEventSchema.safeParse({
        text: "Hello",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("TaskCompletedEventSchema", () => {
    it("validates completed task event", () => {
      const result = TaskCompletedEventSchema.safeParse({
        taskId: "task_123",
        source: "whatsapp",
        chatId: "chat123",
        response: "Done!",
        duration: 1500,
        toolsUsed: ["LIST_FILES", "READ_FILE"],
      });

      expect(result.success).toBe(true);
      expect(result.data?.taskId).toBe("task_123");
      expect(result.data?.toolsUsed).toContain("LIST_FILES");
    });

    it("accepts optional summary", () => {
      const result = TaskCompletedEventSchema.safeParse({
        taskId: "task_123",
        source: "cli",
        response: "Done!",
        summary: "Listed 5 files and read 2",
        duration: 1500,
        toolsUsed: [],
      });

      expect(result.success).toBe(true);
      expect(result.data?.summary).toBe("Listed 5 files and read 2");
    });
  });
});
