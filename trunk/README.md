<!-- markdownlint-disable first-line-heading -->
<!-- mcp-name: io.github.trunk-io/mcp-server -->

[![Trunk.io](https://github.com/user-attachments/assets/c98a90ee-439b-4a9c-bb9a-69dc0e7e2c7e)](https://trunk.io)
[![docs](https://img.shields.io/badge/-docs-darkgreen?logo=readthedocs&logoColor=ffffff)][docs]
[![vscode](https://img.shields.io/visual-studio-marketplace/i/trunk.io?color=0078d7&label=vscode&logo=visualstudiocode)][vscode]
[![slack](https://img.shields.io/badge/-slack-611f69?logo=slack)][slack]
[![openssf](https://api.securityscorecards.dev/projects/github.com/trunk-io/trunk-action/badge)](https://api.securityscorecards.dev/projects/github.com/trunk-io/trunk-action)

# Trunk.io MCP Server

Leverage the power of Trunk Flaky Tests from your IDE, or the AI application of your choosing.

## Use MCP Server

Trunk Flaky Tests comes with a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/docs/getting-started/intro) server. AI applications like Claude Code or Cursor can use MCP servers to connect to data sources, tools, and workflows — enabling them to access key information and perform tasks.

### Supported AI Applications

| Application                                                                                          | Supported | Guide                                                                                             | Plugin                                                          |
| ---------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [Cursor](https://docs.trunk.io/flaky-tests/use-mcp-server/configuration/cursor-ide)                 | Yes       | [Setup guide](https://docs.trunk.io/flaky-tests/use-mcp-server/configuration/cursor-ide)         | [Cursor plugin](https://github.com/trunk-io/cursor-plugin)      |
| [Claude Code](https://docs.trunk.io/flaky-tests/use-mcp-server/configuration/claude-code-cli)       | Yes       | [Setup guide](https://docs.trunk.io/flaky-tests/use-mcp-server/configuration/claude-code-cli)    | [Claude Code plugin](https://github.com/trunk-io/claude-code-plugin) |
| [GitHub Copilot](https://docs.trunk.io/flaky-tests/use-mcp-server/configuration/github-copilot-ide) | Yes       | [Setup guide](https://docs.trunk.io/flaky-tests/use-mcp-server/configuration/github-copilot-ide) |                                                                 |
| [Gemini CLI](https://docs.trunk.io/flaky-tests/use-mcp-server/configuration/gemini-cli)             | Yes       | [Setup guide](https://docs.trunk.io/flaky-tests/use-mcp-server/configuration/gemini-cli)         |                                                                 |

> [!NOTE]
> Gemini Code Assist and Windsurf are not supported due to their limited support for MCP servers.

## Quick Start

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "trunk": {
      "url": "https://mcp.trunk.io/mcp"
    }
  }
}
```

### Claude Code

```bash
claude mcp add trunk --transport streamable-http https://mcp.trunk.io/mcp
```

### GitHub Copilot

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "trunk": {
      "type": "http",
      "url": "https://mcp.trunk.io/mcp"
    }
  }
}
```

### Gemini CLI

Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "trunk": {
      "httpUrl": "https://mcp.trunk.io/mcp"
    }
  }
}
```

## API

The MCP server is available at `https://mcp.trunk.io/mcp` and exposes the following tools:

| Tool                                                                                                              | Description                                                      |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [`fix-flaky-test`](https://docs.trunk.io/flaky-tests/use-mcp-server/mcp-tool-reference/get-root-cause-analysis)  | Retrieve root cause analysis and fix suggestions for flaky tests |
| [`setup-trunk-uploads`](https://docs.trunk.io/flaky-tests/use-mcp-server/mcp-tool-reference/set-up-test-uploads) | Generate a setup plan to upload test results to Trunk            |

## Authorization

The Trunk MCP server supports the **OAuth 2.0 + OpenID Connect** standard for MCP authorization. When connecting from a supported client, you will be prompted to authenticate via your Trunk account.

---

**Made with love by the [Trunk.io](https://trunk.io) team**

[slack]: https://slack.trunk.io
[docs]: https://docs.trunk.io
[vscode]: https://marketplace.visualstudio.com/items?itemName=Trunk.io
