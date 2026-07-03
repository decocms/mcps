/**
 * Pull a JSON-serializable snapshot of MESH_REQUEST_CONTEXT.state. After
 * onChange returns, env.state's binding values turn into Proxies that
 * serialize to `{}` — we want only the raw values ({__type, value} for
 * bindings, plain scalars for the rest). Same pattern as discord/server.
 */
export function extractPersistableState(
  state: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!state) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    try {
      JSON.stringify(value);
      out[key] = value;
    } catch {
      // skip non-serializable values
    }
  }
  return out;
}

/** Binding values persist as {__type, value: connectionId}. */
export function bindingConnectionId(
  state: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = (state ?? {})[key];
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { value?: unknown }).value === "string"
  ) {
    return (value as { value: string }).value;
  }
  return null;
}
