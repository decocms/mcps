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
      "@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm":
        path.resolve(
          __dirname,
          "../packages/cf-sandbox/node_modules/@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm",
        ),
    },
  },
  assetsInclude: ["**/*.wasm"],
  optimizeDeps: {
    include: [
      "use-sync-external-store",
      "use-sync-external-store/shim",
      "use-sync-external-store/shim/with-selector",
    ],
    exclude: [
      "@jitl/quickjs-wasmfile-release-sync",
      "quickjs-emscripten-core",
      "@deco/cf-sandbox",
    ],
    entries: ["!packages/cf-sandbox/**"],
  },
  ssr: {
    noExternal: ["@deco/cf-sandbox"],
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
