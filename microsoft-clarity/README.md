# Microsoft Clarity MCP Server

Official Microsoft Clarity integration for the Model Context Protocol (MCP). This server allows AI agents to query analytics data, list session recordings, and access documentation using natural language.

## Features

- **query-analytics-dashboard**: Get metrics like scroll depth, engagement time, and traffic segments.
- **list-session-recordings**: Filter and find specific user sessions based on behavior and technical criteria.
- **query-documentation-resources**: Search official Clarity guides and troubleshooting steps.

## Installation

When installing in Deco Mesh, you will be prompted for your **Microsoft Clarity API Token**.

### 🔑 Obtaining an API Token
1. Log in to your [Microsoft Clarity](https://clarity.microsoft.com/) project.
2. Navigate to **Settings** -> **Data Export**.
3. Select **Generate new API token**.
4. Copy and store the token safely.

## Usage Guidelines & Limits

> [!IMPORTANT]
> The Microsoft Clarity Data Export API has several built-in constraints:
> - **Quota**: 10 API requests per project per day.
> - **Horizon**: Access up to the last 3 days of analytics data.
> - **Dimensions**: Filter by up to 3 dimensions per query.

### Example Queries
- "Show me the top pages by traffic for the last 3 days."
- "List mobile sessions from the last 24 hours that had rage clicks."
- "How do I set up custom tags in Clarity?"

## Development

```bash
bun install
bun run dev
```

## License
MIT
