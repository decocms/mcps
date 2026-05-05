import {
  type App,
  type McpUiHostContext,
  useApp,
  useHostStyles,
} from "@modelcontextprotocol/ext-apps/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";
import { INITIAL_STATE, type McpState } from "./types.ts";

const McpStateContext = createContext<McpState>(INITIAL_STATE);
const McpAppContext = createContext<App | null>(null);
const McpHostContext = createContext<McpUiHostContext | undefined>(undefined);

export function McpProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<McpState>(INITIAL_STATE);
  const [hostContext, setHostContext] = useState<McpUiHostContext | undefined>(
    undefined,
  );

  const onAppCreated = useCallback((app: App) => {
    app.ontoolinput = (params) => {
      setState((prev) => ({
        ...prev,
        status: "tool-input",
        toolInput: params.arguments,
      }));
    };

    app.ontoolresult = (result) => {
      if (result.isError) {
        const textBlock = result.content?.find((c) => c.type === "text");
        const errorText =
          (textBlock?.type === "text" ? textBlock.text : undefined) ??
          "Tool returned an error";
        setState((prev) => ({ ...prev, status: "error", error: errorText }));
        return;
      }
      setState((prev) => ({
        ...prev,
        status: "tool-result",
        toolResult: result.structuredContent,
      }));
    };

    app.ontoolcancelled = () => {
      setState((prev) => ({ ...prev, status: "tool-cancelled" }));
    };

    app.onerror = (err) => {
      console.error("MCP App error:", err);
    };

    app.onhostcontextchanged = (ctx) => {
      setHostContext((prev) => ({ ...prev, ...ctx }));
    };
  }, []);

  const { app, isConnected } = useApp({
    appInfo: { name: "MCP App", version: "1.0.0" },
    capabilities: {},
    onAppCreated,
  });

  // Apply host styles and fonts
  useHostStyles(app, app?.getHostContext());

  // Set connected state and initial host context once connected
  if (isConnected && state.status === "initializing") {
    const ctx = app?.getHostContext();
    if (ctx) setHostContext(ctx);
    const toolName = ctx?.toolInfo?.tool.name;
    setState({ status: "connected", toolName });
  }

  return (
    <McpAppContext.Provider value={app}>
      <McpHostContext.Provider value={hostContext}>
        <McpStateContext.Provider value={state}>
          {children}
        </McpStateContext.Provider>
      </McpHostContext.Provider>
    </McpAppContext.Provider>
  );
}

export function useMcpState<TInput = unknown, TResult = unknown>() {
  return useContext(McpStateContext) as McpState<TInput, TResult>;
}

export function useMcpApp() {
  return useContext(McpAppContext);
}

export function useMcpHostContext() {
  return useContext(McpHostContext);
}

export { useDocumentTheme as useTheme } from "@modelcontextprotocol/ext-apps/react";
