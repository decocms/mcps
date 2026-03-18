# Rootly MCP

## Project Description

**Rootly MCP** is a Model Context Protocol (MCP) server that integrates with Rootly for incident management, on-call scheduling, and post-incident workflows.

### Purpose

This MCP server allows client applications to:
- Create, update, and resolve incidents in Rootly
- Manage on-call schedules and escalation policies
- Access incident timelines, retrospectives, and action items

### Key Features

- 🚨 **Incident Management**: Create and manage incidents with severity, status, and assignments
- 📟 **On-Call Scheduling**: Query on-call rotations and escalation policies
- 📝 **Retrospectives**: Access and update post-incident reviews and action items
- 🔔 **Alerts & Notifications**: Trigger and manage incident alerts across teams
- 📊 **Incident Analytics**: Retrieve metrics and trends for incident response

## Authentication

Authentication is handled via OAuth through the MCP connection at `https://mcp.rootly.com/sse`. Users authorize access through Rootly's OAuth flow.

## License

MIT
