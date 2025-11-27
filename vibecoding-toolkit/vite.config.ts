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
      "@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm":
        path.resolve(
          __dirname,
          "../packages/cf-sandbox/node_modules/@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm",
        ),
    },
  },

  assetsInclude: ["**/*.wasm"],

  optimizeDeps: {
    exclude: [
      "@jitl/quickjs-wasmfile-release-sync",
      "quickjs-emscripten-core",
      "@deco/cf-sandbox",
    ],
    // Don't scan these packages
    entries: ["!packages/cf-sandbox/**"],
  },

  ssr: {
    // Don't externalize workspace packages during SSR
    noExternal: ["@deco/cf-sandbox"],
  },

  define: {
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV || "development",
    ),
    global: "globalThis",
  },

  cacheDir: "node_modules/.vite",
});
