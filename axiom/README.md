# Axiom MCP

## Project Description

**Axiom MCP** is a Model Context Protocol (MCP) server that provides AI assistants with access to Axiom's observability platform for running APL queries, exploring datasets, and detecting anomalies in log and event data.

### Purpose
- Run Axiom Processing Language (APL) queries against your datasets from AI tools
- Explore and analyze log, event, and trace data for observability workflows
- Detect anomalies and surface insights from high-volume data streams

### Key Features
- 🔍 Execute APL queries against Axiom datasets
- 📂 List and explore available datasets and their schemas
- 🚨 Detect anomalies and statistical outliers in time-series data
- 📊 Retrieve aggregated metrics and event summaries
- ⚡ Stream query results via Server-Sent Events (SSE) for real-time analysis

## Authentication

Authentication is handled via OAuth through the MCP connection. Connect using the URL `https://mcp.axiom.co/sse` and authorize with your Axiom account.

## License

MIT
