# Google BigQuery MCP Server Official

Thin wrapper around Google's official BigQuery MCP server (`bigquery.googleapis.com/mcp`). The wrapper holds the Google OAuth client credentials server-side and proxies JSON-RPC `tools/call` to the upstream — Google's MCP doesn't support Dynamic Client Registration, so this layer is needed to integrate it into mesh.

See [`TOOLS.md`](./TOOLS.md) for the catalog (auto-generated via `bun run generate-tools`). Refresh after Google updates the upstream tools/list.

The OAuth + proxy plumbing lives in `@decocms/mcps-shared/google-mcp` — same code path used by `google-workspace` and the other `google-*-official` wrappers.

---

The upstream **Google BigQuery MCP Server** is provided directly by the Google Cloud team for integration with BigQuery.

## About Google BigQuery

BigQuery is Google's fully managed, serverless data warehouse for analytics. With this official MCP, you can:

- 📊 **SQL Queries** - Run complex SQL queries on massive datasets
- 🗄️ **Dataset Management** - Create and manage datasets and tables
- 📈 **Analytics** - Perform advanced analytics and ML predictions
- 💰 **Cost Analysis** - Monitor and optimize query costs
- 🔄 **Data Loading** - Import data from various sources
- 🤝 **Official Integration** - Direct support and features maintained by the Google Cloud team

## Connection

This MCP connects to the official Google BigQuery server at:

```
https://bigquery.googleapis.com/mcp
```

## How to Use

1. Install this MCP through the registry
2. Configure your Google Cloud credentials when prompted
3. Start analyzing data with AI assistance

## Official Resources

- 🌐 Website: [cloud.google.com/bigquery](https://cloud.google.com/bigquery)
- 📚 Documentation: [cloud.google.com/bigquery/docs](https://cloud.google.com/bigquery/docs)
- 🆘 Support: Contact through Google Cloud support

## Status

✅ **Official MCP** - This is the official MCP server maintained by the Google Cloud team.

---

*This MCP requires an active Google Cloud account with BigQuery enabled.*

