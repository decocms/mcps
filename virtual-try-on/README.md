# Virtual Try-On MCP

This MCP provides a single tool, `VIRTUAL_TRY_ON`, that takes:

- a **person photo URL**
- one or more **garment image URLs**

and delegates generation to a configured **image generator MCP** (e.g. `nanobanana`), returning a generated image URL.

## Configuration (State)

You can configure the generator in one of two ways:

### 1) Direct generator MCP URL

- `generatorMcpUrl`: URL to the generator MCP endpoint (usually ends with `/mcp`)
- `generatorAuthToken` (optional): bearer token for the generator MCP
- `generatorToolName` (optional, default `GENERATE_IMAGE`)
- `defaultModel` (optional)

### 2) Via Deco Mesh connection binding

- `CONNECTION`: `@deco/connection` binding
- `generatorConnectionId`: ID of the connection that points to the generator MCP

## Tool

### `VIRTUAL_TRY_ON`

Input:

- `personImageUrl` (url)
- `garments[]`: `{ imageUrl, type? }`
- `instruction?`
- `aspectRatio?`
- `model?`

Output:

- `image`: generated image URL
- `error?`, `finishReason?`



