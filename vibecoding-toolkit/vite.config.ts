import deco from "@decocms/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), deco({ target: "bun" })],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./view/src"),
    },
  },
});
