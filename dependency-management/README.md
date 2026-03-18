# Sonatype Dependency Management MCP

## Project Description

**Sonatype Dependency Management MCP** is a Model Context Protocol (MCP) server that integrates with Sonatype for dependency security analysis, vulnerability detection, and open source risk management.

### Purpose

This MCP server allows client applications to:
- Analyze software dependencies for known vulnerabilities and license risks
- Query the Sonatype OSS Index for component security information
- Get remediation recommendations for vulnerable dependencies

### Key Features

- 🔒 **Vulnerability Scanning**: Identify CVEs and security issues in open source dependencies
- 📦 **Component Analysis**: Evaluate risk scores for packages across ecosystems (Maven, npm, PyPI, etc.)
- ⚖️ **License Compliance**: Check dependency licenses for legal and policy compliance
- 🛠️ **Remediation Guidance**: Get recommended version upgrades to resolve vulnerabilities
- 📊 **Risk Reporting**: Aggregate risk assessments across entire dependency trees

## Authentication

Authentication is handled via OAuth through the MCP connection at `https://mcp.guide.sonatype.com/mcp`. Users authorize access through Sonatype's OAuth flow.

## License

MIT
