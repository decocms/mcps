/**
 * Prompt Loader
 *
 * Loads prompt templates from markdown files in the prompts/ directory.
 * Supports simple {{variable}} template replacement.
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";

// Resolve the prompts directory relative to this file
// Dev:  this file is at server/lib/prompts.ts → prompts are at ../prompts/
// Prod: bundled to dist/server/main.js → prompts are copied to dist/server/prompts/
const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);

function findPromptsDir(): string {
  // Try sibling directory (dev: server/prompts/ from server/lib/)
  const siblingDir = join(SCRIPT_DIR, "../prompts");
  if (existsSync(siblingDir)) {
    return siblingDir;
  }

  // Try same level (prod: dist/server/prompts/ from dist/server/)
  const sameLevelDir = join(SCRIPT_DIR, "prompts");
  if (existsSync(sameLevelDir)) {
    return sameLevelDir;
  }

  // Fallback
  return siblingDir;
}

const PROMPTS_DIR = findPromptsDir();

/** Cache loaded prompt files to avoid repeated disk reads */
const promptCache = new Map<string, string>();

/**
 * Load a prompt template from a markdown file.
 *
 * @param filename - The markdown file name (e.g. "article_analysis_system.md")
 * @returns The raw template content
 */
function loadPromptTemplate(filename: string): string {
  const cached = promptCache.get(filename);
  if (cached) return cached;

  const filePath = join(PROMPTS_DIR, filename);

  if (!existsSync(filePath)) {
    throw new Error(`Prompt file not found: ${filePath}`);
  }

  const content = readFileSync(filePath, "utf-8").trim();
  promptCache.set(filename, content);
  return content;
}

/**
 * Replace {{variable}} placeholders in a template with provided values.
 *
 * @param template - The template string with {{variable}} placeholders
 * @param variables - Record of variable names to their values
 * @returns The rendered prompt string
 */
function renderTemplate(
  template: string,
  variables: Record<string, string | number>,
): string {
  let rendered = template;

  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.replace(
      new RegExp(`\\{\\{${key}\\}\\}`, "g"),
      String(value),
    );
  }

  return rendered;
}

/**
 * Load and render a prompt template.
 *
 * @param filename - The markdown file name
 * @param variables - Optional variables to replace in the template
 * @returns The rendered prompt string
 */
export function loadPrompt(
  filename: string,
  variables?: Record<string, string | number>,
): string {
  const template = loadPromptTemplate(filename);

  if (variables) {
    return renderTemplate(template, variables);
  }

  return template;
}
