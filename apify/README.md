# Apify MCP 

## Project Description

**Apify MCP** is a Model Context Protocol (MCP) server that integrates with the Apify platform for web scraping and automation tasks. This project runs on Bun with simple token-based authentication.

### Purpose

This MCP server allows client applications to:
- List available Apify actors
- Get details about specific actors
- Run actors synchronously or asynchronously
- Retrieve run results and dataset items
- Manage web scraping and automation workflows

### Key Features

- 🤖 **Apify Integration**: Full access to the Apify API
- 🔄 **Sync & Async Execution**: Run actors and wait for results or get immediate response
- 📊 **Dataset Access**: Retrieve scraped data from actor runs
- 🔍 **Actor Management**: List, search, and get actor details
- ⚙️ **Configurable Runs**: Control memory, timeout, and build versions

## Authentication

Authentication is done via API token passed in the Authorization header:

```
Authorization: Bearer <your-apify-api-token>
```

Get your Apify API token at: https://console.apify.com/account/integrations

## Available Tools

### `list_actors`
List all actors accessible to the user.

### `get_actor`
Get details of a specific actor by ID or name.

### `list_actor_runs`
List runs of a specific actor with filtering options.

### `get_actor_run`
Get details of a specific actor run, optionally including dataset items.

### `run_actor_sync`
Run an actor synchronously and return dataset items when complete.

### `run_actor_async`
Run an actor asynchronously and return immediately with run ID.

## License

MIT

