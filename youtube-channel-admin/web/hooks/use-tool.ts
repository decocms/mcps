import { useCallback, useEffect, useRef, useState } from "react";
import { useMcpApp } from "@/context.tsx";

interface ToolCallResult {
  structuredContent?: unknown;
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
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

/** Imperative tool caller for mutations (register, pause, retry...). */
export function useToolCaller() {
  const app = useMcpApp();

  return useCallback(
    async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
      if (!app?.callServerTool) {
        throw new Error("Host bridge not ready yet");
      }
      const result = (await app.callServerTool({
        name,
        arguments: args,
      })) as ToolCallResult;
      const error = extractToolError(result);
      if (error) throw new Error(error);
      return result.structuredContent as T;
    },
    [app],
  );
}

interface UsePollingToolResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Fetch tool data and keep it fresh: refetches every `intervalMs` and on
 * demand via refresh() (used right after mutations).
 */
export function usePollingTool<T>(
  name: string,
  args: Record<string, unknown>,
  intervalMs = 8000,
): UsePollingToolResult<T> {
  const app = useMcpApp();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const argsKey = JSON.stringify(args);
  const inFlight = useRef(false);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!app?.callServerTool) return;
    let cancelled = false;

    const fetchOnce = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const result = (await app.callServerTool({
          name,
          arguments: JSON.parse(argsKey),
        })) as ToolCallResult;
        if (cancelled) return;
        const toolError = extractToolError(result);
        if (toolError) {
          setError(toolError);
        } else {
          setData(result.structuredContent as T);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Tool call failed");
        }
      } finally {
        inFlight.current = false;
        if (!cancelled) setLoading(false);
      }
    };

    fetchOnce();
    const interval = setInterval(fetchOnce, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [app, name, argsKey, intervalMs, nonce]);

  return { data, loading, error, refresh };
}
