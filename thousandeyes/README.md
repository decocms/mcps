# ThousandEyes MCP

## Project Description

**ThousandEyes MCP** is a Model Context Protocol (MCP) server that integrates with ThousandEyes for network intelligence, internet monitoring, and end-to-end visibility.

### Purpose

This MCP server allows client applications to:
- Query network path and performance data from ThousandEyes agents
- Monitor internet outages, BGP changes, and routing anomalies
- Analyze end-user experience and application delivery metrics

### Key Features

- 🌐 **Network Monitoring**: Access real-time and historical network path data from global agents
- 📡 **Internet Intelligence**: Detect and investigate internet outages and routing changes
- 📊 **Performance Metrics**: Retrieve latency, packet loss, and jitter metrics across paths
- 🔍 **BGP Monitoring**: Track BGP route changes and prefix visibility across providers
- 🖥️ **Endpoint Visibility**: Monitor end-user connectivity and experience data

## Authentication

Authentication is handled via OAuth through the MCP connection at `https://api.thousandeyes.com/mcp`. Users authorize access through ThousandEyes' OAuth flow.

## License

MIT
