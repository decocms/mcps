/**
 * Build MCP Skill
 *
 * Skill for creating new MCP servers with tools and resources.
 */

import type { Skill } from "./index.ts";

export const buildMcpSkill: Skill = {
  id: "build-mcp",
  name: "Build MCP Server",
  description:
    "Create a new MCP server with tools, following the mcps/ patterns",
  stack: ["bun", "typescript"],

  userStories: [
    {
      id: "US-001",
      title: "Create MCP scaffold",
      asA: "developer",
      iWant: "a working MCP server entry point",
      soThat: "I can add tools incrementally",
      acceptanceCriteria: [
        "package.json exists with correct dependencies (@decocms/runtime, zod)",
        "tsconfig.json configured for Bun and bundler mode",
        "server/main.ts creates and starts MCP server using withRuntime",
        "shared/deco.gen.ts defines Env type",
        "Server starts without errors (bun run dev)",
      ],
    },
    {
      id: "US-002",
      title: "Add first tool",
      asA: "developer",
      iWant: "a working tool implementation",
      soThat: "I can verify the pattern works",
      acceptanceCriteria: [
        "Tool file created in server/tools/",
        "Tool uses createPrivateTool from @decocms/runtime/tools",
        "Tool has Zod inputSchema and outputSchema",
        "Tool exported from server/tools/index.ts",
        "Tool registered in main.ts tools array",
        "bun run check passes with no errors",
      ],
      dependsOn: ["US-001"],
    },
    {
      id: "US-003",
      title: "Add app.json for registry",
      asA: "developer",
      iWant: "the MCP registered in the Mesh registry",
      soThat: "users can install it",
      acceptanceCriteria: [
        "app.json exists with name, description, icon",
        "categories and keywords defined",
        "form schema defined if config is needed",
      ],
      dependsOn: ["US-001"],
    },
    {
      id: "US-004",
      title: "Add additional tools",
      asA: "developer",
      iWant: "all required tools implemented",
      soThat: "the MCP is feature-complete",
      acceptanceCriteria: [
        "All tools listed in requirements are implemented",
        "Each tool has proper error handling",
        "bun run check passes",
      ],
      dependsOn: ["US-002"],
    },
  ],

  qualityGates: {
    bun: ["bun run check"],
    "*": ["bun run check"],
  },

  prompts: {
    system: `You are an expert developer building MCP (Model Context Protocol) servers.

## Key Patterns

1. **Entry Point** (server/main.ts):
\`\`\`typescript
import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";
import { tools } from "./tools/index.ts";
import type { Env } from "../shared/deco.gen.ts";

const runtime = withRuntime<Env>({
  tools: (env: Env) => tools.map((createTool) => createTool(env)),
});

if (runtime.fetch) {
  serve(runtime.fetch);
}
\`\`\`

2. **Tool Definition** (server/tools/example.ts):
\`\`\`typescript
import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../shared/deco.gen.ts";

export const createExampleTool = (_env: Env) =>
  createPrivateTool({
    id: "EXAMPLE_TOOL",
    description: "What this tool does",
    inputSchema: z.object({
      param: z.string().describe("Parameter description"),
    }),
    outputSchema: z.object({
      result: z.string(),
    }),
    execute: async ({ context }) => {
      const { param } = context;
      return { result: \`Processed: \${param}\` };
    },
  });

export const exampleTools = [createExampleTool];
\`\`\`

3. **Tools Index** (server/tools/index.ts):
\`\`\`typescript
import { exampleTools } from "./example.ts";
export const tools = [...exampleTools];
\`\`\`

## File Structure

\`\`\`
my-mcp/
├── package.json          # dependencies, scripts
├── tsconfig.json         # TypeScript config
├── app.json              # Mesh registry config
├── server/
│   ├── main.ts          # Entry point
│   └── tools/
│       ├── index.ts     # Export all tools
│       └── *.ts         # Tool implementations
└── shared/
    └── deco.gen.ts      # Type definitions
\`\`\`

## Dependencies

- @decocms/runtime: 1.2.5
- @decocms/mcps-shared: workspace:*
- zod: ^4.0.0

## Quality Gates

Always run \`bun run check\` to verify TypeScript types.
`,

    taskTemplate: `## Current Task
**{{task.title}}** ({{task.id}})

{{#if task.description}}
{{task.description}}
{{/if}}

## Acceptance Criteria
{{#each task.acceptanceCriteria}}
- [ ] {{this}}
{{/each}}

{{#if task.dependsOn}}
## Dependencies
This task depends on: {{#each task.dependsOn}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}
{{/if}}

## Instructions
1. Review the current state of the codebase
2. Make the necessary changes to satisfy the acceptance criteria
3. Run quality gates to verify: {{#each qualityGates}}\`{{this}}\`{{#unless @last}}, {{/unless}}{{/each}}
4. When all criteria are met, output: <promise>COMPLETE</promise>

If you cannot complete the task, explain why and do NOT output the completion token.
`,
  },
};
