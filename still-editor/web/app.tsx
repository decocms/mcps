import { Toaster } from "@decocms/ui/components/sonner.tsx";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { McpProvider } from "./context.tsx";
import { AppRouter } from "./router.tsx";
import "./globals.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing root element");
}

// The design system's dark theme keys off `.dark`; the host announces it with
// `data-theme` on <html>.
const html = document.documentElement;
const syncTheme = () =>
  html.classList.toggle("dark", html.dataset.theme === "dark");
new MutationObserver(syncTheme).observe(html, {
  attributes: true,
  attributeFilter: ["data-theme"],
});
syncTheme();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

const root = createRoot(rootElement);
root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <McpProvider>
        <AppRouter />
        <Toaster />
      </McpProvider>
    </QueryClientProvider>
  </StrictMode>,
);
