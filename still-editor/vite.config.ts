import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// A CSS-only package (e.g. tw-animate-css) exports its stylesheet under the
// `style` condition, which require.resolve does not read.
function resolveStylesheet(require: NodeRequire, specifier: string): string {
  try {
    return require.resolve(specifier);
  } catch {
    for (const dir of require.resolve.paths(specifier) ?? []) {
      const manifest = path.join(dir, specifier, "package.json");
      if (!existsSync(manifest)) continue;
      const pkg = JSON.parse(readFileSync(manifest, "utf8"));
      const style = pkg.style ?? pkg.exports?.["."]?.style;
      if (style) return path.join(path.dirname(manifest), style);
    }
    throw new Error(`Cannot resolve the stylesheet ${specifier}`);
  }
}

// The design system's stylesheet without its @font-face rules: the single-file
// bundle would inline the fonts (~1.2 MB), and the host's fonts apply anyway.
function writeDesignSystemStyles() {
  const source = createRequire(import.meta.url).resolve(
    "@decocms/ui/styles/global.css",
  );
  const components = path.join(path.dirname(source), "../components");
  // Bare imports resolve from the design system's own dependencies.
  const fromDesignSystem = createRequire(source);
  const css = readFileSync(source, "utf8")
    .replace(/@font-face\s*\{[^}]*\}/g, "")
    .replace(
      /@import "((?!tailwindcss")[^"]+)";/g,
      (_, specifier: string) =>
        `@import "${resolveStylesheet(fromDesignSystem, specifier)}";`,
    )
    .replace(
      '@source "../components/**/*.tsx";',
      `@source "${components}/**/*.tsx";`,
    );
  const out = path.join(__dirname, "web", ".generated");
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "design-system.css"), css);
}
writeDesignSystemStyles();

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
    emptyOutDir: true,
    rollupOptions: {
      input: "index.html",
    },
  },
});
