# Still Editor

MCP App for editing a product's **Still** — the garment photo on the brand's backdrop that a storefront shows in its outfit builder — with image models, and publishing the approved version to Wake.

The user opens a product by its storefront link, writes what to change, picks a model, compares versions on their own or next to the pair garment, adjusts the size, and publishes. The Still it replaces is kept, and any publication can be restored.

## How it works

- **Edit.** The model edits a plain-background image of the garment: the previous version's output, the original generation (when seeded into storage), or the live Still. References are that image plus up to two model photos from the product gallery. The result is composed on the brand's plate (1600×2000, 4×5) at the same garment width as the current Still, then checked against the Still standard (frame, backdrop, margins, centring). An edit runs as a job (`still_edit_start` → `still_edit_status`) because image models take longer than a UI tool call may wait.
- **Create.** For a top or a bottom with no Still, the editor generates one from the product photos, the way the production batches did: a vision model writes the product facts (color, fabric, shape, hardware) and the view of each photo, through Studio's `generate_text` on the org's chat model, or on the org's OpenRouter key in AI providers when that fails (without either, the Still is made from the photos alone); the image model paints the garment with its pair, top over bottom, on white (grey for a light color, or again on grey when the garment comes out near white); the image is cut in two and the garment composed on the plate at the scale that gives the pair's half the width of the pair's published Still, so the two keep their proportion in Mix & Match. The pair is the Look complementar when it is in the store; any garment of the other type in the same color can be chosen, or none. Creation is refused for a piece with a Still, one that is not a top or a bottom, and one whose images are all marked as print. Facts are kept per product and can be corrected for the next creation. A created version is published and edited like any other.
- **A Still that left its order.** Reordering images in the Wake admin renumbers them, so a Still can leave `STILL_ORDER` and the storefront stops seeing it. Before creating, the editor looks for an image that is a Still (1600×2000 with the plate around the garment, pixel for pixel) at another order, and offers to put it back instead: Wake cannot change an image's order, so the same image is published at `STILL_ORDER` on every variant and the copy at the old order is deleted.
- **Publish.** For every variant, main variant last: check its images belong to the product, upload the new Still at `STILL_ORDER`, delete the old one. A failure on any variant puts back what was changed. One publication per product at a time; it refuses when the Still changed since the product was opened.
- **Image processing** uses WebAssembly codecs (`@jsquash/*`): the control-plane runner ships the bundle without `node_modules`, so native libraries are not available. `bun build` emits the `.wasm` files next to `dist/server/main.js`.

## Configuration

| Field | Description |
| --- | --- |
| `WAKE` | Wake connection with an admin `apiToken` allowed to write product images. |
| `OBJECT_STORAGE` | Storage for versions, backups, jobs and the publication log. |
| `STILL_ORDER` | Image order that marks the Still (default 85). |
| `TOP_CATEGORY_IDS` / `BOTTOM_CATEGORY_IDS` | Wake categories that tell a top from a bottom. |
| `STORAGE_PREFIX` | Storage folder (default `still-editor`). |
| `DEFAULT_MODEL` / `MODELS` | Models offered in the editor (OpenRouter ids). |
| `FACTS_MODEL` | Vision model for the product facts on the org's OpenRouter key, when the org's chat model fails (default `anthropic/claude-opus-5.5`). |

Image models run through Studio's `generate_image` (the `SELF::` scopes) on the organization's OpenRouter key in Settings → AI providers, whatever the image tier is set to; that OpenRouter account pays. The product facts of a new Still run through Studio's `generate_text` on the organization's chat model (the `smart` tier, paid from the org's AI allowance like the chat), and on that same OpenRouter key when the chat model fails.

Storage must hold the backdrop plate at `<prefix>/assets/plate.png`, 1600×2000 and already blurred. A product's original generation can be seeded at `<prefix>/pieces/<productId>/source.json` (`raw`, `half`, `background`, `facts`, `pairProductId`) with the generation image at the `raw` path; without it, edits start from the live Still.

When Wake rejects the admin token, the editor tells the user to renew it (the Wake MCP's `[wake-admin-token-rejected]` error).

## Development

```bash
bun install          # from the monorepo root
cd still-editor
bun run dev          # API with hot reload + UI build in watch mode
bun run check        # type-check
bun test
bun run build        # dist/client (UI) + dist/server (API and .wasm)
```

`AUTH_TOKEN` must be set (see the root README, "Authentication").
