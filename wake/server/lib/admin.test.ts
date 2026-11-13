import { describe, expect, it } from "bun:test";
import { ADMIN_TOKEN_REJECTED, adminErrorMessage } from "./admin.ts";

describe("adminErrorMessage", () => {
  it("tells the user to renew a rejected apiToken", () => {
    for (const status of [401, 403]) {
      const message = adminErrorMessage(status, "Unauthorized", "");
      expect(message.startsWith(ADMIN_TOKEN_REJECTED)).toBe(true);
      expect(message).toContain("update the apiToken");
    }
  });

  it("keeps other failures as they are", () => {
    const message = adminErrorMessage(500, "Server Error", "boom");
    expect(message.startsWith(ADMIN_TOKEN_REJECTED)).toBe(false);
    expect(message).toContain("HTTP 500");
  });
});
