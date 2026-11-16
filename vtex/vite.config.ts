import { cloudflare } from "@cloudflare/vite-plugin";
import deco from "@decocms/mcps-shared/vite-plugin";
import { defineConfig } from "vite";

// Worker (server) build for Cloudflare Workers. The React web apps are built
// separately by `vite.config.web.ts` into dist/client and inlined into this
// bundle via `?raw` imports, so build:web must run first.
const VITE_SERVER_ENVIRONMENT_NAME = "server";

export default defineConfig({
  plugins: [
    cloudflare({
      configPath: "wrangler.toml",
      viteEnvironment: { name: VITE_SERVER_ENVIRONMENT_NAME },
    }),
    deco(),
  ],
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV || "production",
    ),
    global: "globalThis",
  },
  cacheDir: "node_modules/.vite",
});
