# Google GKE MCP Server Official

Thin wrapper around Google's official GKE MCP server (`container.googleapis.com/mcp`). The wrapper holds the Google OAuth client credentials server-side and proxies JSON-RPC `tools/call` to the upstream — Google's MCP doesn't support Dynamic Client Registration, so this layer is needed to integrate it into mesh.

See [`TOOLS.md`](./TOOLS.md) for the catalog (auto-generated via `bun run generate-tools`). Refresh after Google updates the upstream tools/list.

The OAuth + proxy plumbing lives in `@decocms/mcps-shared/google-mcp` — same code path used by `google-workspace` and the other `google-*-official` wrappers.

---

The upstream **Google GKE MCP Server** is provided directly by the Google Cloud team for integration with Google Kubernetes Engine.

## About Google GKE

Google Kubernetes Engine (GKE) is a managed Kubernetes service for deploying containerized applications. With this official MCP, you can:

- 🚀 **Cluster Management** - Create and manage Kubernetes clusters
- 📦 **Container Deployment** - Deploy and scale containerized apps
- 📊 **Monitoring** - Monitor cluster health and performance
- 🔒 **Security** - Manage security policies and access control
- ⚙️ **Configuration** - Configure nodes, networking, and resources
- 🤝 **Official Integration** - Direct support and features maintained by the Google Cloud team

## Connection

This MCP connects to the official Google GKE server at:

```
https://container.googleapis.com/mcp
```

## How to Use

1. Install this MCP through the registry
2. Configure your Google Cloud credentials when prompted
3. Start managing your Kubernetes clusters with AI assistance

## Official Resources

- 🌐 Website: [cloud.google.com/kubernetes-engine](https://cloud.google.com/kubernetes-engine)
- 📚 Documentation: [cloud.google.com/kubernetes-engine/docs](https://cloud.google.com/kubernetes-engine/docs)
- 🆘 Support: Contact through Google Cloud support

## Status

✅ **Official MCP** - This is the official MCP server maintained by the Google Cloud team.

---

*This MCP requires an active Google Cloud account with GKE enabled.*

