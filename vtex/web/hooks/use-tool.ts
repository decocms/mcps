import { useEffect, useMemo, useState } from "react";
import { useMcpApp, useMcpState } from "@/context.tsx";

interface ToolCallResult {
  structuredContent?: unknown;
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
}

interface UseToolResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function extractToolError(result: ToolCallResult): string | null {
  if (!result.isError) return null;
  const text = (result.content ?? [])
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text ?? "")
    .join("\n")
    .trim();
  return text || "Tool returned an error";
}

function stableArgsKey(args: Record<string, unknown>): string {
  return JSON.stringify(args);
}

/**
 * Fetch tool data for MCP App UIs.
 *
 * - Chat flow: uses `ontoolresult` when the host pushes structured content.
 * - Home tiles: calls `app.callServerTool` directly (same pattern as system-health-agent).
 */
export function useTool<
  T,
  A extends Record<string, unknown> = Record<string, unknown>,
>(name: string, args: A): UseToolResult<T> {
  const app = useMcpApp();
  const mcpState = useMcpState<A, T>();
  const argsKey = useMemo(() => stableArgsKey(args), [args]);

  const hostResult =
    mcpState.status === "tool-result"
      ? (mcpState.toolResult as T | undefined)
      : undefined;
  const hostError =
    mcpState.status === "error" ? (mcpState.error ?? "Tool failed") : null;

  const [fetched, setFetched] = useState<UseToolResult<T>>({
    data: hostResult ?? null,
    loading: !hostResult && !hostError,
    error: hostError,
  });

  useEffect(() => {
    if (hostResult) {
      setFetched({ data: hostResult, loading: false, error: null });
      return;
    }
    if (hostError) {
      setFetched({ data: null, loading: false, error: hostError });
      return;
    }
    if (!app?.callServerTool) {
      setFetched((prev) => ({ ...prev, loading: true, error: null }));
      return;
    }

    let cancelled = false;
    setFetched({ data: null, loading: true, error: null });

    app
      .callServerTool({ name, arguments: args })
      .then((result) => {
        if (cancelled) return;
        const toolResult = result as ToolCallResult;
        const toolErr = extractToolError(toolResult);
        if (toolErr) {
          setFetched({ data: null, loading: false, error: toolErr });
          return;
        }
        setFetched({
          data: (toolResult.structuredContent as T) ?? null,
          loading: false,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFetched({
          data: null,
          loading: false,
          error: err instanceof Error ? err.message : "Tool call failed",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [app, args, argsKey, hostError, hostResult, name]);

  if (hostResult) {
    return { data: hostResult, loading: false, error: null };
  }
  if (hostError) {
    return { data: null, loading: false, error: hostError };
  }
  return fetched;
}
