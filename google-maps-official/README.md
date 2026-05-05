# Google Maps MCP Server Official

Thin wrapper around Google's official Maps MCP server (`mapstools.googleapis.com/mcp`). The wrapper holds the Google OAuth client credentials server-side and proxies JSON-RPC `tools/call` to the upstream — Google's MCP doesn't support Dynamic Client Registration, so this layer is needed to integrate it into mesh.

See [`TOOLS.md`](./TOOLS.md) for the catalog (auto-generated via `bun run generate-tools`). Refresh after Google updates the upstream tools/list.

The OAuth + proxy plumbing lives in `@decocms/mcps-shared/google-mcp` — same code path used by `google-workspace` and the other `google-*-official` wrappers.

---

The upstream **Google Maps MCP Server** is provided directly by the Google Maps team for integration with Google Maps Platform.

## About Google Maps

Google Maps Platform provides APIs for maps, routes, and places. With this official MCP, you can:

- 🗺️ **Mapping** - Access and display Google Maps
- 📍 **Geocoding** - Convert addresses to coordinates and vice versa
- 🧭 **Directions** - Get routing and navigation data
- 📌 **Places** - Search for places and get detailed information
- 🌍 **Geographic Data** - Access geographic and location data
- 🤝 **Official Integration** - Direct support and features maintained by the Google Maps team

## Connection

This MCP connects to the official Google Maps server at:

```
https://mapstools.googleapis.com/mcp
```

## How to Use

1. Install this MCP through the registry
2. Configure your Google Maps API key when prompted
3. Start using Maps services with AI assistance

## Official Resources

- 🌐 Website: [developers.google.com/maps](https://developers.google.com/maps)
- 📚 Documentation: [developers.google.com/maps/documentation](https://developers.google.com/maps/documentation)
- 🆘 Support: Contact through Google Maps Platform support

## Status

✅ **Official MCP** - This is the official MCP server maintained by the Google Maps team.

---

*This MCP requires an active Google Maps Platform API key.*

