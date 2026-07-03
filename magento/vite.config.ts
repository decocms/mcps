import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const MCP_APP_ENTRIES = {
  "orders-timeline": path.resolve(__dirname, "orders-timeline.html"),
  "orders-sales-card": path.resolve(__dirname, "orders-sales-card.html"),
  "cancellation-rate": path.resolve(__dirname, "cancellation-rate.html"),
  "top-products": path.resolve(__dirname, "top-products.html"),
  "status-breakdown": path.resolve(__dirname, "status-breakdown.html"),
} as const;

type McpAppEntry = keyof typeof MCP_APP_ENTRIES;

function resolveEntry(): McpAppEntry {
  const entry = process.env.MCP_APP_ENTRY;
  if (entry && entry in MCP_APP_ENTRIES) {
    return entry as McpAppEntry;
  }
  return "orders-timeline";
}

const activeEntry = resolveEntry();

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
    tailwindcss(),
    viteSingleFile(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./web"),
    },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: process.env.MCP_APP_EMPTY_OUTDIR !== "false",
    rollupOptions: {
      input: MCP_APP_ENTRIES[activeEntry],
    },
  },
});
