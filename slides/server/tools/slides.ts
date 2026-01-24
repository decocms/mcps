/**
 * Slide management tools for slide presentations.
 *
 * These tools handle CRUD operations for individual slides including
 * creation, updates, deletion, listing, and reordering.
 *
 * SLIDE LAYOUTS:
 * - title: Opening slide with large title, decorative shapes, and logo
 * - content: Main content slide with title, sections, bullets, and footer
 * - stats: Large numbers in a grid (3-4 stats)
 * - two-column: Side-by-side comparison with column titles and bullets
 * - list: 2x2 grid of items with title + description
 * - quote: Centered quote with attribution
 * - image: Full background image with overlay text
 * - custom: Raw HTML content
 */
import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";

// Shared schemas
const LayoutSchema = z.enum([
  "title",
  "content",
  "two-column",
  "stats",
  "list",
  "quote",
  "image",
  "custom",
]);

const BulletSchema = z.object({
  text: z.string().describe("Bullet point text"),
  highlight: z
    .boolean()
    .optional()
    .describe("Highlight in brand color (for key terms)"),
});

const SlideItemSchema = z.object({
  title: z.string().optional().describe("Section title or heading"),
  subtitle: z.string().optional().describe("Description or subtext"),
  value: z
    .string()
    .optional()
    .describe("For stats: the number (e.g., '2,847', '89%', 'R$42M')"),
  label: z.string().optional().describe("For stats: label below the number"),
  bullets: z
    .array(BulletSchema)
    .optional()
    .describe("Bullet points with optional highlighting"),
  nestedBullets: z
    .array(BulletSchema)
    .optional()
    .describe("Second-level bullets (hollow circles)"),
});

const SlideDataSchema = z.object({
  id: z.string().describe("Unique slide identifier"),
  layout: LayoutSchema.describe("Slide layout type"),
  title: z.string().describe("Main slide title"),
  subtitle: z.string().optional().describe("Subtitle or description"),
  tag: z
    .string()
    .optional()
    .describe("Small uppercase label above title (e.g., 'METHODOLOGY')"),
  items: z
    .array(SlideItemSchema)
    .optional()
    .describe("Content items (sections, stats, list items)"),
  source: z
    .string()
    .optional()
    .describe(
      "Source citation for footer (e.g., 'Company Report - July 2023')",
    ),
  label: z
    .string()
    .optional()
    .describe("Footer label (e.g., 'Public', 'Confidential')"),
  backgroundImage: z
    .string()
    .optional()
    .describe("URL for background image (image layout)"),
  customHtml: z
    .string()
    .optional()
    .describe("Raw HTML content (custom layout only)"),
});

/**
 * SLIDE_CREATE - Create a new slide
 */
export const createSlideCreateTool = (_env: Env) =>
  createTool({
    id: "SLIDE_CREATE",
    _meta: { "ui/resourceUri": "ui://slide" },
    description: `Create a new slide. Returns slide JSON to save and updated manifest.

LAYOUT EXAMPLES:

**title** - Opening slide
  { layout: "title", title: "PRESENTATION TITLE" }

**content** - Main content with bullets
  { layout: "content", title: "What is X?", tag: "OVERVIEW",
    items: [{ title: "Key Points", bullets: [{ text: "First point" }, { text: "Important", highlight: true }] }],
    source: "Company Report 2023", label: "Public" }

**stats** - Large numbers
  { layout: "stats", title: "Key Metrics", tag: "RESULTS",
    items: [{ value: "2,847", label: "Total Users" }, { value: "89%", label: "Success Rate" }] }

**two-column** - Side-by-side
  { layout: "two-column", title: "Comparison", tag: "ANALYSIS",
    items: [{ title: "Option A", bullets: [...] }, { title: "Option B", bullets: [...] }] }

**list** - 2x2 grid of items
  { layout: "list", title: "Our Services", subtitle: "What we offer",
    items: [{ title: "Service 1", subtitle: "Description" }, ...] }`,
    inputSchema: z.object({
      manifest: z.string().describe("Current manifest.json content"),
      layout: LayoutSchema.describe("Slide layout type"),
      title: z.string().describe("Main slide title"),
      subtitle: z.string().optional().describe("Subtitle or description"),
      tag: z.string().optional().describe("Uppercase label above title"),
      items: z.array(SlideItemSchema).optional().describe("Content items"),
      source: z.string().optional().describe("Footer source citation"),
      label: z.string().optional().describe("Footer label"),
      backgroundImage: z.string().optional().describe("Background image URL"),
      customHtml: z.string().optional().describe("Raw HTML (custom layout)"),
      position: z.number().optional().describe("Insert position (0-indexed)"),
    }),
    outputSchema: z.object({
      slideFile: z.object({
        filename: z
          .string()
          .describe("Filename for the slide (e.g., '001-title.json')"),
        content: z.string().describe("JSON content to write to the slide file"),
      }),
      updatedManifest: z.string().describe("Updated manifest.json content"),
      slideId: z.string().describe("ID of the created slide"),
      position: z.number().describe("Position of the slide in the deck"),
    }),
    execute: async ({ context }) => {
      const { manifest: manifestStr, position, ...slideData } = context;
      const manifest = JSON.parse(manifestStr);

      // Generate slide ID and filename
      const slideIndex = manifest.slides?.length || 0;
      const slideNum = String(slideIndex + 1).padStart(3, "0");
      const slideId = `slide-${slideNum}-${Date.now()}`;
      const slugTitle = slideData.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .substring(0, 20);
      const filename = `${slideNum}-${slugTitle || slideData.layout}.json`;

      // Create slide object (only include defined fields)
      const slide: Record<string, unknown> = {
        id: slideId,
        layout: slideData.layout,
        title: slideData.title,
      };

      if (slideData.subtitle) slide.subtitle = slideData.subtitle;
      if (slideData.tag) slide.tag = slideData.tag;
      if (slideData.items?.length) slide.items = slideData.items;
      if (slideData.source) slide.source = slideData.source;
      if (slideData.label) slide.label = slideData.label;
      if (slideData.backgroundImage)
        slide.backgroundImage = slideData.backgroundImage;
      if (slideData.customHtml) slide.customHtml = slideData.customHtml;

      // Update manifest
      const manifestEntry = {
        id: slideId,
        file: filename,
        title: slideData.title,
        layout: slideData.layout,
      };

      if (!manifest.slides) {
        manifest.slides = [];
      }

      const insertPosition =
        position !== undefined &&
        position >= 0 &&
        position <= manifest.slides.length
          ? position
          : manifest.slides.length;

      manifest.slides.splice(insertPosition, 0, manifestEntry);
      manifest.updatedAt = new Date().toISOString();

      return {
        slideFile: {
          filename,
          content: JSON.stringify(slide, null, 2),
        },
        updatedManifest: JSON.stringify(manifest, null, 2),
        slideId,
        position: insertPosition,
      };
    },
  });

/**
 * SLIDE_UPDATE - Update an existing slide
 */
export const createSlideUpdateTool = (_env: Env) =>
  createTool({
    id: "SLIDE_UPDATE",
    description:
      "Update an existing slide. Returns the updated slide content and manifest.",
    inputSchema: z.object({
      manifest: z.string().describe("Current manifest.json content"),
      slideId: z.string().describe("ID of the slide to update"),
      currentSlideContent: z
        .string()
        .describe("Current JSON content of the slide file"),
      updates: z
        .object({
          layout: LayoutSchema.optional(),
          title: z.string().optional(),
          subtitle: z.string().optional(),
          tag: z.string().optional(),
          items: z.array(SlideItemSchema).optional(),
          source: z.string().optional(),
          label: z.string().optional(),
          backgroundImage: z.string().optional(),
          customHtml: z.string().optional(),
        })
        .describe("Fields to update"),
    }),
    outputSchema: z.object({
      updatedSlideContent: z
        .string()
        .describe("Updated JSON content for the slide file"),
      updatedManifest: z.string().describe("Updated manifest.json content"),
      filename: z.string().describe("Filename of the updated slide"),
    }),
    execute: async ({ context }) => {
      const {
        manifest: manifestStr,
        slideId,
        currentSlideContent,
        updates,
      } = context;
      const manifest = JSON.parse(manifestStr);
      const currentSlide = JSON.parse(currentSlideContent);

      // Find slide in manifest
      const slideIndex = manifest.slides?.findIndex(
        (s: any) => s.id === slideId,
      );
      if (slideIndex === -1 || slideIndex === undefined) {
        throw new Error(`Slide with ID "${slideId}" not found in manifest`);
      }

      // Merge updates with current slide
      const updatedSlide = {
        ...currentSlide,
        ...updates,
        id: slideId, // Preserve ID
      };

      // Update manifest entry if title or layout changed
      if (updates.title || updates.layout) {
        manifest.slides[slideIndex] = {
          ...manifest.slides[slideIndex],
          title: updates.title || manifest.slides[slideIndex].title,
          layout: updates.layout || manifest.slides[slideIndex].layout,
        };
      }
      manifest.updatedAt = new Date().toISOString();

      return {
        updatedSlideContent: JSON.stringify(updatedSlide, null, 2),
        updatedManifest: JSON.stringify(manifest, null, 2),
        filename: manifest.slides[slideIndex].file,
      };
    },
  });

/**
 * SLIDE_DELETE - Delete a slide
 */
export const createSlideDeleteTool = (_env: Env) =>
  createTool({
    id: "SLIDE_DELETE",
    description:
      "Delete a slide from the deck. Returns the updated manifest and the filename to delete.",
    inputSchema: z.object({
      manifest: z.string().describe("Current manifest.json content"),
      slideId: z.string().describe("ID of the slide to delete"),
    }),
    outputSchema: z.object({
      updatedManifest: z.string().describe("Updated manifest.json content"),
      deletedFilename: z.string().describe("Filename of the slide to delete"),
      message: z.string().describe("Success message"),
    }),
    execute: async ({ context }) => {
      const { manifest: manifestStr, slideId } = context;
      const manifest = JSON.parse(manifestStr);

      // Find slide in manifest
      const slideIndex = manifest.slides?.findIndex(
        (s: any) => s.id === slideId,
      );
      if (slideIndex === -1 || slideIndex === undefined) {
        throw new Error(`Slide with ID "${slideId}" not found in manifest`);
      }

      const deletedSlide = manifest.slides[slideIndex];
      manifest.slides.splice(slideIndex, 1);
      manifest.updatedAt = new Date().toISOString();

      return {
        updatedManifest: JSON.stringify(manifest, null, 2),
        deletedFilename: deletedSlide.file,
        message: `Slide "${deletedSlide.title}" deleted successfully.`,
      };
    },
  });

/**
 * SLIDE_GET - Get a slide's data
 */
export const createSlideGetTool = (_env: Env) =>
  createTool({
    id: "SLIDE_GET",
    description: "Parse and return structured data from a slide file.",
    inputSchema: z.object({
      slideContent: z.string().describe("JSON content of the slide file"),
    }),
    outputSchema: SlideDataSchema,
    execute: async ({ context }) => {
      const slide = JSON.parse(context.slideContent);
      return slide;
    },
  });

/**
 * SLIDE_LIST - List all slides in the deck
 */
export const createSlideListTool = (_env: Env) =>
  createTool({
    id: "SLIDE_LIST",
    description: "List all slides in the deck with their metadata.",
    inputSchema: z.object({
      manifest: z.string().describe("Content of manifest.json"),
    }),
    outputSchema: z.object({
      slides: z.array(
        z.object({
          id: z.string(),
          file: z.string(),
          title: z.string(),
          layout: z.string(),
          position: z.number(),
        }),
      ),
      total: z.number(),
    }),
    execute: async ({ context }) => {
      const manifest = JSON.parse(context.manifest);
      const slides = (manifest.slides || []).map((s: any, i: number) => ({
        id: s.id,
        file: s.file,
        title: s.title,
        layout: s.layout,
        position: i,
      }));

      return {
        slides,
        total: slides.length,
      };
    },
  });

/**
 * SLIDE_REORDER - Reorder slides in the deck
 */
export const createSlideReorderTool = (_env: Env) =>
  createTool({
    id: "SLIDE_REORDER",
    description:
      "Reorder slides in the deck by moving a slide to a new position.",
    inputSchema: z.object({
      manifest: z.string().describe("Current manifest.json content"),
      slideId: z.string().describe("ID of the slide to move"),
      newPosition: z
        .number()
        .describe("New position for the slide (0-indexed)"),
    }),
    outputSchema: z.object({
      updatedManifest: z.string().describe("Updated manifest.json content"),
      message: z.string().describe("Success message"),
      newOrder: z
        .array(
          z.object({
            id: z.string(),
            title: z.string(),
            position: z.number(),
          }),
        )
        .describe("New slide order"),
    }),
    execute: async ({ context }) => {
      const { manifest: manifestStr, slideId, newPosition } = context;
      const manifest = JSON.parse(manifestStr);

      if (!manifest.slides || manifest.slides.length === 0) {
        throw new Error("No slides in deck");
      }

      // Find current position
      const currentIndex = manifest.slides.findIndex(
        (s: any) => s.id === slideId,
      );
      if (currentIndex === -1) {
        throw new Error(`Slide with ID "${slideId}" not found`);
      }

      // Validate new position
      const validPosition = Math.max(
        0,
        Math.min(newPosition, manifest.slides.length - 1),
      );

      // Move slide
      const [slide] = manifest.slides.splice(currentIndex, 1);
      manifest.slides.splice(validPosition, 0, slide);
      manifest.updatedAt = new Date().toISOString();

      const newOrder = manifest.slides.map((s: any, i: number) => ({
        id: s.id,
        title: s.title,
        position: i,
      }));

      return {
        updatedManifest: JSON.stringify(manifest, null, 2),
        message: `Slide "${slide.title}" moved to position ${validPosition + 1}.`,
        newOrder,
      };
    },
  });

/**
 * SLIDE_DUPLICATE - Duplicate an existing slide
 */
export const createSlideDuplicateTool = (_env: Env) =>
  createTool({
    id: "SLIDE_DUPLICATE",
    description: "Duplicate an existing slide. Creates a copy with a new ID.",
    inputSchema: z.object({
      manifest: z.string().describe("Current manifest.json content"),
      slideId: z.string().describe("ID of the slide to duplicate"),
      slideContent: z
        .string()
        .describe("JSON content of the slide to duplicate"),
    }),
    outputSchema: z.object({
      slideFile: z.object({
        filename: z.string().describe("Filename for the new slide"),
        content: z.string().describe("JSON content to write"),
      }),
      updatedManifest: z.string().describe("Updated manifest.json content"),
      newSlideId: z.string().describe("ID of the new slide"),
      position: z.number().describe("Position of the new slide"),
    }),
    execute: async ({ context }) => {
      const { manifest: manifestStr, slideId, slideContent } = context;
      const manifest = JSON.parse(manifestStr);
      const originalSlide = JSON.parse(slideContent);

      // Find original slide position
      const originalIndex = manifest.slides?.findIndex(
        (s: any) => s.id === slideId,
      );
      if (originalIndex === -1 || originalIndex === undefined) {
        throw new Error(`Slide with ID "${slideId}" not found`);
      }

      // Generate new ID and filename
      const slideNum = String(manifest.slides.length + 1).padStart(3, "0");
      const newSlideId = `slide-${slideNum}-${Date.now()}`;
      const slugTitle = originalSlide.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .substring(0, 20);
      const filename = `${slideNum}-${slugTitle || originalSlide.layout}-copy.json`;

      // Create new slide with new ID
      const newSlide = {
        ...originalSlide,
        id: newSlideId,
        title: `${originalSlide.title} (Copy)`,
      };

      // Add to manifest after original
      const manifestEntry = {
        id: newSlideId,
        file: filename,
        title: newSlide.title,
        layout: newSlide.layout,
      };

      const insertPosition = originalIndex + 1;
      manifest.slides.splice(insertPosition, 0, manifestEntry);
      manifest.updatedAt = new Date().toISOString();

      return {
        slideFile: {
          filename,
          content: JSON.stringify(newSlide, null, 2),
        },
        updatedManifest: JSON.stringify(manifest, null, 2),
        newSlideId,
        position: insertPosition,
      };
    },
  });

/**
 * SLIDES_PREVIEW - Preview a complete presentation
 *
 * This tool displays slides in an interactive viewer UI (MCP App).
 */
export const createSlidesPreviewTool = (_env: Env) =>
  createTool({
    id: "SLIDES_PREVIEW",
    _meta: { "ui/resourceUri": "ui://slides-viewer" },
    description: `Preview a complete slide presentation in an interactive viewer.

Opens the slides viewer UI with navigation, keyboard controls, and thumbnails.

**Use this to:**
- Show the user their presentation
- Preview slides before exporting
- Navigate through the deck

**Input:** Array of slide objects (or JSON strings to parse)`,
    inputSchema: z.object({
      title: z.string().optional().describe("Presentation title"),
      slides: z
        .array(z.unknown())
        .describe("Array of slide objects or JSON strings"),
    }),
    outputSchema: z.object({
      title: z.string(),
      slides: z.array(z.unknown()),
      slideCount: z.number(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const { title = "Presentation", slides: rawSlides } = context;

      // Parse slides if they're strings
      const slides = rawSlides.map((slide) => {
        if (typeof slide === "string") {
          try {
            return JSON.parse(slide);
          } catch {
            return { title: "Parse Error", layout: "content" };
          }
        }
        return slide;
      });

      return {
        title,
        slides,
        slideCount: slides.length,
        message: `Showing ${slides.length} slides. Use arrow keys or buttons to navigate.`,
      };
    },
  });

// Export all slide tools
export const slideTools = [
  createSlideCreateTool,
  createSlideUpdateTool,
  createSlideDeleteTool,
  createSlideGetTool,
  createSlideListTool,
  createSlideReorderTool,
  createSlideDuplicateTool,
  createSlidesPreviewTool,
];
