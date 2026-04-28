import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import deco from "@decocms/mcps-shared/vite-plugin";

const VITE_SERVER_ENVIRONMENT_NAME = "server";

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
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV || "development",
    ),
    global: "globalThis",
  },

  cacheDir: "node_modules/.vite",
});
