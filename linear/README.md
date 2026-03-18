# Linear MCP

## Project Description

**Linear MCP** is a Model Context Protocol (MCP) server that integrates with Linear for project management and issue tracking.

### Purpose

This MCP server allows client applications to:
- Create, update, and query Linear issues and projects
- Manage workflows, cycles, and team assignments
- Track progress and status across engineering projects

### Key Features

- 📋 **Issue Management**: Create, update, search, and close Linear issues
- 🔄 **Workflow Automation**: Transition issue states and manage workflows
- 👥 **Team Collaboration**: Assign issues, manage team members, and projects
- 🔍 **Powerful Search**: Query issues by status, assignee, label, and more
- 📊 **Project Tracking**: Access cycles, milestones, and roadmap data

## Authentication

Authentication is handled via OAuth through the MCP connection at `https://mcp.linear.app/sse`. Users authorize access through Linear's OAuth flow.

## License

MIT
