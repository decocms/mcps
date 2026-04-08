# New Relic MCP

## Project Description

**New Relic MCP** is a Model Context Protocol (MCP) server that integrates with New Relic's observability platform to provide access to metrics, logs, traces, and alerts.

### Purpose

This MCP server allows client applications to:

- Query application performance metrics and infrastructure data
- Search and analyze logs across services and environments
- Investigate distributed traces and identify bottlenecks

### Key Features

- 📈 **Metrics & Dashboards**: Query NRQL for custom metrics and performance data
- 📋 **Log Management**: Search and filter logs across applications and infrastructure
- 🔍 **Distributed Tracing**: Explore traces to diagnose latency and errors
- 🚨 **Alerts & Incidents**: Access alert conditions, incidents, and notification channels
- 🏗️ **Entity Exploration**: Browse monitored services, hosts, and applications

## Authentication

Authentication is handled via OAuth through the MCP connection at `https://mcp.newrelic.com/mcp`. Users authorize access through New Relic's OAuth flow.

## License

MIT
