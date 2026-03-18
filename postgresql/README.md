# PostgreSQL MCP

## Project Description

**PostgreSQL MCP** is a Model Context Protocol (MCP) server that enables natural language and structured queries against PostgreSQL databases via the Waystation platform.

### Purpose

This MCP server allows client applications to:
- Execute SQL queries against connected PostgreSQL databases
- Explore database schemas, tables, and relationships
- Retrieve and analyze data without direct database access

### Key Features

- 🗄️ **SQL Query Execution**: Run SELECT queries and retrieve results from PostgreSQL
- 🔎 **Schema Exploration**: Inspect tables, columns, indexes, and constraints
- 🔒 **Secure Access**: Database credentials managed securely via Waystation
- 📊 **Data Analysis**: Aggregate and filter data for reporting and insights
- 🔗 **Multi-Database Support**: Connect to multiple PostgreSQL instances through Waystation

## Authentication

Authentication is handled via OAuth through the MCP connection at `https://waystation.ai/postgres/mcp`. Database credentials are managed securely by the Waystation platform.

## License

MIT
