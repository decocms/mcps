/**
 * Input coercion helpers.
 *
 * Some MCP transports JSON-encode structured params (arrays, objects) as
 * strings before delivering them to the server, and stringify numeric params.
 * These helpers make input schemas tolerant of that quirk so calls like
 * `{ groupBy: '["service","level"]' }` or `{ limit: "100" }` succeed.
 */

import { z } from "zod";

const parseJsonString = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (
    !(
      (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
      (trimmed.startsWith("{") && trimmed.endsWith("}"))
    )
  ) {
    return value;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

export const arr = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(parseJsonString, schema);

export const num = () => z.coerce.number();
