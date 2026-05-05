/**
 * Minimal JSON Schema → Zod converter, scoped to the shapes Google MCP servers
 * return in tools/list. Anything we don't recognize falls back to z.unknown(),
 * letting the request through for the upstream backend to validate.
 */

import { z } from "zod";

type JsonSchema = {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  default?: unknown;
};

export function jsonSchemaToZod(schema: unknown): z.ZodTypeAny {
  if (!schema || typeof schema !== "object") return z.unknown();
  const s = schema as JsonSchema;

  if (Array.isArray(s.oneOf) || Array.isArray(s.anyOf)) {
    return z.unknown().describe(s.description ?? "");
  }

  const type = Array.isArray(s.type)
    ? (s.type.find((t) => t !== "null") ?? "unknown")
    : s.type;

  switch (type) {
    case "object":
      return objectSchema(s);
    case "string":
      return stringSchema(s);
    case "integer":
    case "number":
      return numberSchema(s);
    case "boolean":
      return withDescription(z.boolean(), s.description);
    case "array":
      return withDescription(
        z.array(jsonSchemaToZod(s.items ?? {})),
        s.description,
      );
    default:
      return withDescription(z.unknown(), s.description);
  }
}

function objectSchema(s: JsonSchema): z.ZodTypeAny {
  const props = s.properties ?? {};
  const required = new Set(s.required ?? []);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, propSchema] of Object.entries(props)) {
    const child = jsonSchemaToZod(propSchema);
    shape[key] = required.has(key) ? child : child.optional();
  }
  return withDescription(z.object(shape).passthrough(), s.description);
}

function stringSchema(s: JsonSchema): z.ZodTypeAny {
  if (Array.isArray(s.enum) && s.enum.length > 0) {
    const values = s.enum.filter((v): v is string => typeof v === "string");
    if (values.length === s.enum.length && values.length > 0) {
      return withDescription(
        z.enum(values as [string, ...string[]]),
        s.description,
      );
    }
  }
  return withDescription(z.string(), s.description);
}

function numberSchema(s: JsonSchema): z.ZodTypeAny {
  return withDescription(z.number(), s.description);
}

function withDescription<T extends z.ZodTypeAny>(
  schema: T,
  description: string | undefined,
): z.ZodTypeAny {
  return description ? schema.describe(description) : schema;
}
