/**
 * Brand MCP - AI-Powered Brand Research & Design System Generator
 *
 * A complete toolset for discovering brand identity and generating design systems.
 *
 * ## Features
 *
 * - **Brand Scraping** - Extract colors, fonts, logos from websites using Firecrawl
 * - **Brand Research** - Deep research using Perplexity AI
 * - **Design System Generation** - CSS variables, JSX components, style guides
 * - **MCP Apps UI** - Interactive brand previews
 *
 * ## Required Bindings
 *
 * Configure at least one of these for full functionality:
 * - **FIRECRAWL** - For website scraping and brand extraction
 * - **PERPLEXITY** - For AI-powered brand research
 */
import { serve } from "@decocms/mcps-shared/serve";
import { withRuntime } from "@decocms/runtime";
import { tools } from "./tools/index.ts";
import { resources } from "./resources/index.ts";
import { StateSchema, type Env, type Registry } from "./types/env.ts";

export { StateSchema };

const runtime = withRuntime<Env, typeof StateSchema, Registry>({
  configuration: {
    scopes: ["PERPLEXITY::*", "FIRECRAWL::*"],
    state: StateSchema,
  },
  tools,
  prompts: [],
  resources,
});

serve(runtime.fetch);
