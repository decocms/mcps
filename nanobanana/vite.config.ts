import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import deco from "@decocms/mcps-shared/vite-plugin";

const VITE_SERVER_ENVIRONMENT_NAME = "server";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    cloudflare({
      configPath: "wrangler.toml",
      viteEnvironment: {
        name: VITE_SERVER_ENVIRONMENT_NAME,
      },
    }),
    deco(),
  ],

  define: {
    // Ensure proper module definitions for Cloudflare Workers context
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV || "development",
    ),
    global: "globalThis",
  },

  // Clear cache more aggressively
  cacheDir: "node_modules/.vite",
});
