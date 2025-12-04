import { cloudflare } from "@cloudflare/vite-plugin";
import deco from "@decocms/mcps-shared/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

const VITE_SERVER_ENVIRONMENT_NAME = "server";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    cloudflare({
      configPath: "wrangler.toml",
      viteEnvironment: {
        name: VITE_SERVER_ENVIRONMENT_NAME,
      },
    }),
    tailwindcss(),
    deco(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./view/src"),
    },
  },
  optimizeDeps: {
    include: [
      "use-sync-external-store",
      "use-sync-external-store/shim",
      "use-sync-external-store/shim/with-selector",
    ],
  },
  define: {
    // Ensure proper module definitions for Cloudflare Workers context
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV || "development",
    ),
    global: "globalThis",
    // '__filename': '""',
    // '__dirname': '""',
  },

  // Clear cache more aggressively
  cacheDir: "node_modules/.vite",
});
