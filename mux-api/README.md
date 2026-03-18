# Mux MCP

## Project Description

**Mux MCP** is a Model Context Protocol (MCP) server that integrates with Mux for video streaming, media management, and video analytics via the Mux API.

### Purpose

This MCP server allows client applications to:
- Upload, manage, and retrieve video assets and live streams
- Access video playback URLs and thumbnail generation
- Query video performance metrics and viewer analytics

### Key Features

- 🎥 **Video Asset Management**: Upload, list, update, and delete video assets
- 📡 **Live Streaming**: Create and manage live streams and simulcasts
- 🔗 **Playback URLs**: Retrieve signed and unsigned playback URLs for video delivery
- 📊 **Video Analytics**: Access playback performance, error rates, and viewer metrics
- 🖼️ **Thumbnail Generation**: Generate video thumbnails and animated GIFs at any timestamp

## Authentication

Authentication is handled via OAuth through the MCP connection at `https://mcp.mux.com`. Users authorize access through Mux's OAuth flow.

## License

MIT
