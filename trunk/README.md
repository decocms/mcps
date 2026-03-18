# Trunk MCP

## Project Description

**Trunk MCP** is a Model Context Protocol (MCP) server that integrates with Trunk for flaky test detection, root cause analysis, and test suite health management.

### Purpose

This MCP server allows client applications to:
- Identify and track flaky tests across CI/CD pipelines
- Analyze root causes of test failures and instability
- Monitor overall test suite health and trends over time

### Key Features

- 🧪 **Flaky Test Detection**: Identify tests that fail intermittently across runs
- 🔍 **Root Cause Analysis**: Diagnose underlying causes of test failures and flakiness
- 📊 **Test Health Metrics**: Track pass rates, failure trends, and test suite stability
- 🔄 **CI/CD Integration**: Access test results from connected CI pipelines
- 📋 **Quarantine Management**: Review and manage quarantined flaky tests

## Authentication

Authentication is handled via OAuth through the MCP connection at `https://mcp.trunk.io/mcp`. Users authorize access through Trunk's OAuth flow.

## License

MIT
