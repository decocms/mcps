import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  assertWriteModeEnabled,
  isReadOnlyTool,
  resolveWriteMode,
} from "./write-mode.ts";

// ── resolveWriteMode ───────────────────────────────────────────────────────────

describe("resolveWriteMode", () => {
  const originalEnv = process.env.VTEX_WRITE_MODE;

  beforeEach(() => {
    delete process.env.VTEX_WRITE_MODE;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.VTEX_WRITE_MODE;
    else process.env.VTEX_WRITE_MODE = originalEnv;
  });

  test("read-only when state is undefined and no env override", () => {
    expect(resolveWriteMode(undefined)).toBe(false);
  });

  test("read-only when writeMode is omitted from state", () => {
    expect(resolveWriteMode({ accountName: "acme" })).toBe(false);
  });

  test("writes allowed when state.writeMode is true", () => {
    expect(resolveWriteMode({ writeMode: true })).toBe(true);
  });

  test("explicit state.writeMode:false wins over env override", () => {
    process.env.VTEX_WRITE_MODE = "true";
    expect(resolveWriteMode({ writeMode: false })).toBe(false);
  });

  test("env override enables writes when state is silent", () => {
    process.env.VTEX_WRITE_MODE = "true";
    expect(resolveWriteMode(undefined)).toBe(true);
    expect(resolveWriteMode({ accountName: "acme" })).toBe(true);
  });

  test("non-boolean writeMode values do not enable writes", () => {
    expect(resolveWriteMode({ writeMode: "true" })).toBe(false);
    expect(resolveWriteMode({ writeMode: 1 })).toBe(false);
  });
});

// ── isReadOnlyTool ──────────────────────────────────────────────────────────────

describe("isReadOnlyTool", () => {
  test("true only for explicit readOnlyHint: true", () => {
    expect(isReadOnlyTool({ readOnlyHint: true })).toBe(true);
  });

  test("false for missing annotations (treated as write)", () => {
    expect(isReadOnlyTool(undefined)).toBe(false);
    expect(isReadOnlyTool({})).toBe(false);
  });

  test("false for destructive/non-read annotations", () => {
    expect(isReadOnlyTool({ destructiveHint: true })).toBe(false);
    expect(isReadOnlyTool({ destructiveHint: false })).toBe(false);
    expect(isReadOnlyTool({ readOnlyHint: false })).toBe(false);
  });
});

// ── assertWriteModeEnabled ──────────────────────────────────────────────────────

describe("assertWriteModeEnabled", () => {
  const originalEnv = process.env.VTEX_WRITE_MODE;

  beforeEach(() => {
    delete process.env.VTEX_WRITE_MODE;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.VTEX_WRITE_MODE;
    else process.env.VTEX_WRITE_MODE = originalEnv;
  });

  test("throws in read-only mode, naming the tool", () => {
    expect(() =>
      assertWriteModeEnabled({ accountName: "acme" }, "VTEX_UPDATE_PRODUCT"),
    ).toThrow(/VTEX_UPDATE_PRODUCT.*read-only mode/s);
  });

  test("does not throw when write mode is enabled", () => {
    expect(() =>
      assertWriteModeEnabled({ writeMode: true }, "VTEX_UPDATE_PRODUCT"),
    ).not.toThrow();
  });
});
