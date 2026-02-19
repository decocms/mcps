import { describe, test, expect } from "bun:test";
import { z } from "zod";
import { flattenRequestSchema, unflattenToStructured } from "./tool-adapter.ts";

// ── flattenRequestSchema ───────────────────────────────────────────────────────

describe("flattenRequestSchema", () => {
  test("promotes path params to top-level (required)", () => {
    const schema = z.object({
      path: z.object({ productId: z.number(), slug: z.string() }),
      query: z.optional(z.never()),
      body: z.optional(z.never()),
      headers: z.object({ Accept: z.string() }),
    });

    const flat = flattenRequestSchema(schema as any);
    expect(Object.keys(flat.shape)).toEqual(["productId", "slug"]);
    // path params should remain as-is (not wrapped in optional)
    expect(flat.shape.productId).toBeInstanceOf(z.ZodNumber);
    expect(flat.shape.slug).toBeInstanceOf(z.ZodString);
  });

  test("promotes optional query params to top-level as optional", () => {
    const schema = z.object({
      path: z.optional(z.never()),
      query: z.optional(
        z.object({ page: z.number(), size: z.optional(z.number()) }),
      ),
      body: z.optional(z.never()),
      headers: z.object({ Accept: z.string() }),
    });

    const flat = flattenRequestSchema(schema as any);
    expect(Object.keys(flat.shape).sort()).toEqual(["page", "size"]);
    // outer optional wrapper → required query param becomes optional
    expect(flat.shape.page).toBeInstanceOf(z.ZodOptional);
    // already optional → stays optional
    expect(flat.shape.size).toBeInstanceOf(z.ZodOptional);
  });

  test("promotes body object fields to top-level", () => {
    const schema = z.object({
      path: z.optional(z.never()),
      query: z.optional(z.never()),
      body: z.object({ name: z.string(), price: z.number() }),
      headers: z.object({ "Content-Type": z.string() }),
    });

    const flat = flattenRequestSchema(schema as any);
    expect(Object.keys(flat.shape).sort()).toEqual(["name", "price"]);
    expect(flat.shape.name).toBeInstanceOf(z.ZodString);
  });

  test("keeps non-object body under 'body' key", () => {
    const schema = z.object({
      path: z.optional(z.never()),
      query: z.optional(z.never()),
      body: z.array(z.string()),
      headers: z.object({ "Content-Type": z.string() }),
    });

    const flat = flattenRequestSchema(schema as any);
    expect(Object.keys(flat.shape)).toEqual(["body"]);
    expect(flat.shape.body).toBeInstanceOf(z.ZodArray);
  });

  test("skips headers entirely", () => {
    const schema = z.object({
      path: z.object({ id: z.number() }),
      query: z.optional(z.never()),
      body: z.optional(z.never()),
      headers: z.object({ "X-Api-Key": z.string(), Accept: z.string() }),
    });

    const flat = flattenRequestSchema(schema as any);
    expect(Object.keys(flat.shape)).not.toContain("X-Api-Key");
    expect(Object.keys(flat.shape)).not.toContain("Accept");
    expect(Object.keys(flat.shape)).not.toContain("headers");
  });

  test("combines path, query, and body fields", () => {
    const schema = z.object({
      path: z.object({ productId: z.number() }),
      query: z.object({ page: z.optional(z.number()) }),
      body: z.object({ name: z.string() }),
      headers: z.object({ Accept: z.string() }),
    });

    const flat = flattenRequestSchema(schema as any);
    expect(Object.keys(flat.shape).sort()).toEqual([
      "name",
      "page",
      "productId",
    ]);
  });

  test("handles schema with all never fields (no-param endpoint)", () => {
    const schema = z.object({
      path: z.optional(z.never()),
      query: z.optional(z.never()),
      body: z.optional(z.never()),
      headers: z.object({ Accept: z.string() }),
    });

    const flat = flattenRequestSchema(schema as any);
    expect(Object.keys(flat.shape)).toEqual([]);
  });
});

// ── unflattenToStructured ─────────────────────────────────────────────────────

describe("unflattenToStructured", () => {
  test("reconstructs path params", () => {
    const schema = z.object({
      path: z.object({ productId: z.number() }),
      query: z.optional(z.never()),
      body: z.optional(z.never()),
      headers: z.object({ Accept: z.string() }),
    });

    const result = unflattenToStructured({ productId: 42 }, schema as any);
    expect(result.path).toEqual({ productId: 42 });
    expect(result.query).toBeUndefined();
    expect(result.body).toBeUndefined();
  });

  test("reconstructs query params, omitting undefined values", () => {
    const schema = z.object({
      path: z.optional(z.never()),
      query: z.optional(
        z.object({ page: z.number(), size: z.optional(z.number()) }),
      ),
      body: z.optional(z.never()),
      headers: z.object({ Accept: z.string() }),
    });

    const result = unflattenToStructured({ page: 2 }, schema as any);
    expect(result.query).toEqual({ page: 2 });
    // size was not provided → should not appear in query
    expect(result.query?.size).toBeUndefined();
  });

  test("reconstructs body fields", () => {
    const schema = z.object({
      path: z.optional(z.never()),
      query: z.optional(z.never()),
      body: z.object({ name: z.string(), price: z.number() }),
      headers: z.object({ "Content-Type": z.string() }),
    });

    const result = unflattenToStructured(
      { name: "Widget", price: 9.99 },
      schema as any,
    );
    expect(result.body).toEqual({ name: "Widget", price: 9.99 });
  });

  test("handles non-object body via 'body' key", () => {
    const schema = z.object({
      path: z.optional(z.never()),
      query: z.optional(z.never()),
      body: z.array(z.string()),
      headers: z.object({ "Content-Type": z.string() }),
    });

    const result = unflattenToStructured({ body: ["a", "b"] }, schema as any);
    expect(result.body).toEqual(["a", "b"]);
  });

  test("returns empty object when no params match", () => {
    const schema = z.object({
      path: z.optional(z.never()),
      query: z.optional(z.never()),
      body: z.optional(z.never()),
      headers: z.object({ Accept: z.string() }),
    });

    const result = unflattenToStructured({}, schema as any);
    expect(result.path).toBeUndefined();
    expect(result.query).toBeUndefined();
    expect(result.body).toBeUndefined();
  });

  test("ignores extra fields not in schema", () => {
    const schema = z.object({
      path: z.object({ id: z.number() }),
      query: z.optional(z.never()),
      body: z.optional(z.never()),
      headers: z.object({ Accept: z.string() }),
    });

    const result = unflattenToStructured(
      { id: 1, unknownField: "foo" } as any,
      schema as any,
    );
    expect(result.path).toEqual({ id: 1 });
    // unknownField should not leak into any output
    expect(JSON.stringify(result)).not.toContain("unknownField");
  });
});

// ── Round-trip ────────────────────────────────────────────────────────────────

describe("flatten → unflatten round-trip", () => {
  test("round-trips path + query + body", () => {
    const schema = z.object({
      path: z.object({ productId: z.number() }),
      query: z.object({ page: z.optional(z.number()), sort: z.string() }),
      body: z.object({ name: z.string() }),
      headers: z.object({ Accept: z.string() }),
    });

    // Simulate what a user would pass as flat input
    const flatInput = { productId: 5, sort: "asc", name: "Widget" };

    const structured = unflattenToStructured(flatInput, schema as any);
    expect(structured.path).toEqual({ productId: 5 });
    expect(structured.query).toEqual({ sort: "asc" });
    expect(structured.body).toEqual({ name: "Widget" });
  });
});
