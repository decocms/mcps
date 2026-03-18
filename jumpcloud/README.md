# JumpCloud MCP

## Project Description

**JumpCloud MCP** is a Model Context Protocol (MCP) server that gives AI assistants access to JumpCloud's directory and identity management platform for managing users, devices, and access policies.

### Purpose
- Query and manage users, groups, and devices across your JumpCloud directory
- Automate identity lifecycle tasks such as provisioning and deprovisioning
- Inspect and enforce access policies, SSO applications, and MFA settings

### Key Features
- 👤 Manage users and user groups in your directory
- 💻 Query and manage enrolled devices and system inventory
- 🔐 Configure SSO applications and access permissions
- 🛡️ Inspect MFA policies and authentication settings
- 📋 Audit directory events and activity logs

## Authentication

Authentication is handled via OAuth through the MCP connection. Connect using the URL `https://mcp.jumpcloud.com/v1` and authorize with your JumpCloud administrator credentials.

## License

MIT
