# Virtual Try-On MCP

This MCP provides a single tool, `VIRTUAL_TRY_ON`, that takes:

- a **person photo URL**
- one or more **garment image URLs**

and delegates generation to **nanobanana**, returning a generated image URL.

## Configuration (State)

| Field | Type | Description |
|---|---|---|
| `NANOBANANA` | `@deco/nanobanana` binding | Nanobanana image generator. |

Simply connect a nanobanana MCP through the Mesh UI.

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
