import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import deco from "@decocms/mcps-shared/vite-plugin";

import path from "path";

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

  // Treat WASM files as assets to be bundled
  assetsInclude: ["**/*.wasm"],

  // Exclude quickjs from dependency optimization
  optimizeDeps: {
    exclude: ["@jitl/quickjs-wasmfile-release-sync", "quickjs-emscripten-core"],
  },

  define: {
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV || "development",
    ),
    global: "globalThis",
  },

  cacheDir: "node_modules/.vite",
});
