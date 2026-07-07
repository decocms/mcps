# grafana

Query and manage self-hosted Grafana: datasources, dashboards, and Prometheus/PromQL queries via /api/ds/query

## Getting Started

1. Configure your MCP in `server/types/env.ts`
2. Implement tools in `server/tools/`
3. Rename `app.json.example` to `app.json` and customize
4. Add to `deploy.json` for deployment
5. Test with `bun run dev`

See [template-minimal/README.md](../template-minimal/README.md) for detailed instructions.
