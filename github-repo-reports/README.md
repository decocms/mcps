# github-repo-reports

GitHub-backed reports MCP server implementing the Reports Binding. Stores and reads reports as Markdown files with YAML frontmatter from a configurable GitHub repository.

## Getting Started

1. Configure your MCP in `server/types/env.ts`
2. Implement tools in `server/tools/`
3. Rename `app.json.example` to `app.json` and customize
4. Add to `deploy.json` for deployment
5. Test with `bun run dev`

See [template-minimal/README.md](../template-minimal/README.md) for detailed instructions.

