import { StrictMode, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { McpAppShell } from "@/components/mcp-app-shell.tsx";
import { McpProvider } from "@/context.tsx";
import "./globals.css";

export function mountMcpApp(Page: ComponentType) {
  const rootElement = document.getElementById("root");

  if (!rootElement) {
    throw new Error("Missing root element");
  }

  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
      <McpProvider>
        <McpAppShell>
          <Page />
        </McpAppShell>
      </McpProvider>
    </StrictMode>,
  );
}
