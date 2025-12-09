import { defineConfig } from "vite";
import deco from "@decocms/vite-plugin";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [deco()],

  define: {
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV || "development",
    ),
  },

  // Clear cache more aggressively
  cacheDir: "node_modules/.vite",
});
