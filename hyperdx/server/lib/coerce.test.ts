import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { arr, num } from "./coerce.ts";
import { queryChartDataInputSchema } from "./types.ts";

describe("arr", () => {
  const schema = arr(z.array(z.string()));

  test("passes arrays through unchanged", () => {
    expect(schema.parse(["a", "b"])).toEqual(["a", "b"]);
  });

  test("parses JSON-encoded array string", () => {
    expect(schema.parse('["a","b"]')).toEqual(["a", "b"]);
  });

  test("tolerates whitespace around JSON string", () => {
    expect(schema.parse('  ["a","b"]  ')).toEqual(["a", "b"]);
  });

  test("non-JSON-looking string falls through to inner schema (errors)", () => {
    expect(() => schema.parse("not-an-array")).toThrow();
  });

  test("malformed JSON string falls through to inner schema (errors)", () => {
    expect(() => schema.parse("[a, b]")).toThrow();
  });

  test("respects optional + default on inner schema", () => {
    const optionalSchema = arr(z.array(z.string()).optional().default(["x"]));
    expect(optionalSchema.parse(undefined)).toEqual(["x"]);
    expect(optionalSchema.parse('["a"]')).toEqual(["a"]);
  });

  test("parses nested object arrays", () => {
    const objSchema = arr(z.array(z.object({ k: z.string() })));
    expect(objSchema.parse('[{"k":"v"}]')).toEqual([{ k: "v" }]);
  });
});

describe("num", () => {
  test("passes numbers through", () => {
    expect(num().parse(42)).toBe(42);
  });

  test("coerces numeric string", () => {
    expect(num().parse("42")).toBe(42);
  });

  test("rejects non-numeric string", () => {
    expect(() => num().parse("abc")).toThrow();
  });
});

describe("queryChartDataInputSchema with stringified series", () => {
  test("accepts a JSON-encoded series array", () => {
    const result = queryChartDataInputSchema.parse({
      series:
        '[{"dataSource":"events","aggFn":"count","where":"","groupBy":["service"]}]',
    });
    expect(result.series).toEqual([
      {
        dataSource: "events",
        aggFn: "count",
        where: "",
        groupBy: ["service"],
      },
    ]);
  });

  test("accepts JSON-encoded groupBy inside series", () => {
    const result = queryChartDataInputSchema.parse({
      series: [
        {
          dataSource: "events",
          aggFn: "count",
          where: "",
          groupBy: '["service","level"]',
        },
      ],
    });
    expect(result.series[0]?.groupBy).toEqual(["service", "level"]);
  });
});
