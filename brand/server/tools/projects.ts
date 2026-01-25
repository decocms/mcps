/**
 * Brand Project Management Tools
 *
 * CRUD operations for brand projects with state persistence.
 * Projects are saved immediately when created and can be resumed.
 */
import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";
import { BrandIdentitySchema, type BrandIdentity } from "./research.ts";

/**
 * Project status enum
 */
const ProjectStatusSchema = z.enum([
  "draft", // Just created, no research yet
  "researching", // Brand research in progress
  "designing", // Design system being generated
  "complete", // All done
]);

export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

/**
 * Brand project schema
 */
export const BrandProjectSchema = z.object({
  id: z.string().describe("Unique project ID"),
  name: z.string().describe("Project name"),
  prompt: z.string().optional().describe("Initial prompt/description"),
  websiteUrl: z.string().url().optional().describe("Brand website URL"),
  status: ProjectStatusSchema.describe("Current project status"),
  wizardStep: z
    .number()
    .default(0)
    .describe("Current step in the creation wizard"),
  identity: BrandIdentitySchema.optional().describe(
    "Discovered brand identity",
  ),
  css: z.string().optional().describe("Generated CSS variables"),
  jsx: z.string().optional().describe("Generated JSX design system"),
  styleGuide: z.string().optional().describe("Generated style guide"),
  createdAt: z.string().describe("ISO timestamp of creation"),
  updatedAt: z.string().describe("ISO timestamp of last update"),
});

export type BrandProject = z.infer<typeof BrandProjectSchema>;

/**
 * In-memory project store
 * In production, this would be backed by a database
 */
const projectStore: Map<string, BrandProject> = new Map();

/**
 * Generate a unique project ID
 */
function generateId(): string {
  return `brand_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * PROJECT_CREATE - Create a new brand project
 */
export const createProjectCreateTool = (_env: Env) =>
  createTool({
    id: "PROJECT_CREATE",
    _meta: { "ui/resourceUri": "ui://project-wizard" },
    description: `Create a new brand project.

The project is saved immediately and can be resumed later.
Returns the project with its ID for tracking.

**Use this as the first step** when starting a new brand.`,
    inputSchema: z.object({
      name: z.string().describe("Project/brand name"),
      prompt: z
        .string()
        .optional()
        .describe("Description or prompt for the brand"),
      websiteUrl: z.string().url().optional().describe("Brand website URL"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      project: BrandProjectSchema.optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const { name, prompt, websiteUrl } = context;

      const now = new Date().toISOString();
      const project: BrandProject = {
        id: generateId(),
        name,
        prompt,
        websiteUrl,
        status: "draft",
        wizardStep: 1, // Move to step 1 after creation
        createdAt: now,
        updatedAt: now,
      };

      projectStore.set(project.id, project);

      console.log(`[brand-mcp] 📁 Created project: ${project.id} (${name})`);

      return {
        success: true,
        project,
      };
    },
  });

/**
 * PROJECT_LIST - List all brand projects
 */
export const createProjectListTool = (_env: Env) =>
  createTool({
    id: "PROJECT_LIST",
    _meta: { "ui/resourceUri": "ui://brand-list" },
    description: `List all brand projects.

Returns projects sorted by last updated (most recent first).`,
    inputSchema: z.object({
      status: ProjectStatusSchema.optional().describe("Filter by status"),
    }),
    outputSchema: z.object({
      projects: z.array(BrandProjectSchema),
      total: z.number(),
    }),
    execute: async ({ context }) => {
      const { status } = context;

      let projects = Array.from(projectStore.values());

      // Filter by status if provided
      if (status) {
        projects = projects.filter((p) => p.status === status);
      }

      // Sort by updatedAt descending
      projects.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );

      return {
        projects,
        total: projects.length,
      };
    },
  });

/**
 * PROJECT_GET - Get a specific project by ID
 */
export const createProjectGetTool = (_env: Env) =>
  createTool({
    id: "PROJECT_GET",
    _meta: { "ui/resourceUri": "ui://project-wizard" },
    description: `Get a brand project by ID.

Use this to resume a project from where you left off.`,
    inputSchema: z.object({
      projectId: z.string().describe("Project ID to retrieve"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      project: BrandProjectSchema.optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const { projectId } = context;

      const project = projectStore.get(projectId);

      if (!project) {
        return {
          success: false,
          error: `Project not found: ${projectId}`,
        };
      }

      return {
        success: true,
        project,
      };
    },
  });

/**
 * PROJECT_UPDATE - Update a project's state
 */
export const createProjectUpdateTool = (_env: Env) =>
  createTool({
    id: "PROJECT_UPDATE",
    _meta: { "ui/resourceUri": "ui://project-wizard" },
    description: `Update a brand project.

Use this to save progress at any step of the wizard.`,
    inputSchema: z.object({
      projectId: z.string().describe("Project ID to update"),
      name: z.string().optional().describe("Update project name"),
      prompt: z.string().optional().describe("Update prompt"),
      websiteUrl: z.string().url().optional().describe("Update website URL"),
      status: ProjectStatusSchema.optional().describe("Update status"),
      wizardStep: z.number().optional().describe("Update wizard step"),
      identity: BrandIdentitySchema.optional().describe("Set brand identity"),
      css: z.string().optional().describe("Set generated CSS"),
      jsx: z.string().optional().describe("Set generated JSX"),
      styleGuide: z.string().optional().describe("Set generated style guide"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      project: BrandProjectSchema.optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const { projectId, ...updates } = context;

      const project = projectStore.get(projectId);

      if (!project) {
        return {
          success: false,
          error: `Project not found: ${projectId}`,
        };
      }

      // Apply updates
      const updatedProject: BrandProject = {
        ...project,
        ...Object.fromEntries(
          Object.entries(updates).filter(([_, v]) => v !== undefined),
        ),
        updatedAt: new Date().toISOString(),
      };

      projectStore.set(projectId, updatedProject);

      console.log(
        `[brand-mcp] 📝 Updated project: ${projectId} (step ${updatedProject.wizardStep}, status: ${updatedProject.status})`,
      );

      return {
        success: true,
        project: updatedProject,
      };
    },
  });

/**
 * PROJECT_DELETE - Delete a project
 */
export const createProjectDeleteTool = (_env: Env) =>
  createTool({
    id: "PROJECT_DELETE",
    description: `Delete a brand project.

This action cannot be undone.`,
    inputSchema: z.object({
      projectId: z.string().describe("Project ID to delete"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const { projectId } = context;

      if (!projectStore.has(projectId)) {
        return {
          success: false,
          error: `Project not found: ${projectId}`,
        };
      }

      projectStore.delete(projectId);

      console.log(`[brand-mcp] 🗑️  Deleted project: ${projectId}`);

      return {
        success: true,
      };
    },
  });

/**
 * PROJECT_RESEARCH - Research brand for a project
 */
export const createProjectResearchTool = (env: Env) =>
  createTool({
    id: "PROJECT_RESEARCH",
    _meta: { "ui/resourceUri": "ui://project-wizard" },
    description: `Research and discover brand identity for a project.

This combines scraping and AI research, then saves the results to the project.`,
    inputSchema: z.object({
      projectId: z.string().describe("Project ID"),
      websiteUrl: z.string().url().optional().describe("Website to research"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      project: BrandProjectSchema.optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const { projectId, websiteUrl } = context;

      const project = projectStore.get(projectId);

      if (!project) {
        return {
          success: false,
          error: `Project not found: ${projectId}`,
        };
      }

      const url = websiteUrl || project.websiteUrl;
      if (!url) {
        return {
          success: false,
          error: "No website URL provided for research",
        };
      }

      // Update status to researching
      project.status = "researching";
      project.websiteUrl = url;
      project.updatedAt = new Date().toISOString();
      projectStore.set(projectId, project);

      const firecrawl = env.MESH_REQUEST_CONTEXT?.state?.FIRECRAWL;
      const perplexity = env.MESH_REQUEST_CONTEXT?.state?.PERPLEXITY;

      const identity: Partial<BrandIdentity> = {
        name: project.name,
        sources: [],
        confidence: "low",
      };

      // Scrape with Firecrawl
      if (firecrawl) {
        try {
          const result = (await firecrawl.firecrawl_scrape({
            url,
            formats: ["branding", "links"],
          })) as { branding?: Record<string, unknown> };

          if (result?.branding) {
            const branding = result.branding;

            if (branding.colors && typeof branding.colors === "object") {
              const colors = branding.colors as Record<string, string>;
              identity.colors = {
                primary: colors.primary || colors.main || "#8B5CF6",
                secondary: colors.secondary,
                accent: colors.accent,
                background: colors.background,
                text: colors.text,
              };
            }

            if (branding.logos) {
              if (Array.isArray(branding.logos)) {
                identity.logos = { primary: branding.logos[0] as string };
              } else if (typeof branding.logos === "object") {
                const logos = branding.logos as Record<string, string>;
                identity.logos = {
                  primary: logos.primary || logos.main,
                  light: logos.light,
                  dark: logos.dark,
                  icon: logos.icon,
                };
              }
            }

            if (branding.fonts && typeof branding.fonts === "object") {
              const fonts = branding.fonts as Record<string, string>;
              identity.typography = {
                headingFont: fonts.heading || fonts.title,
                bodyFont: fonts.body || fonts.text,
                monoFont: fonts.mono,
              };
            }

            identity.sources?.push(url);
          }
        } catch (error) {
          console.error("[brand-mcp] Scraping error:", error);
        }
      }

      // Research with Perplexity
      if (perplexity) {
        try {
          const result = (await perplexity.perplexity_research({
            messages: [
              {
                role: "user",
                content: `Brief info on ${project.name} (${url}): tagline, primary color hex, and brand personality in 2-3 sentences.`,
              },
            ],
            strip_thinking: true,
          })) as { response?: string };

          if (result?.response) {
            const response = result.response;

            // Extract tagline
            const taglineMatch = response.match(
              /(?:tagline|slogan)[:\s]+["']?([^"'\n.]+)["']?/i,
            );
            if (taglineMatch) {
              identity.tagline = taglineMatch[1].trim();
            }

            // Extract colors if we don't have good ones
            if (!identity.colors || identity.colors.primary === "#8B5CF6") {
              const hexColors = response.match(/#[0-9A-Fa-f]{6}/g);
              if (hexColors?.length) {
                identity.colors = {
                  ...(identity.colors || {}),
                  primary: hexColors[0],
                };
              }
            }

            identity.sources?.push("perplexity-research");
          }
        } catch (error) {
          console.error("[brand-mcp] Research error:", error);
        }
      }

      // Set default colors if none found
      if (!identity.colors) {
        identity.colors = { primary: "#8B5CF6" };
      }

      // Determine confidence
      const hasLogo = Boolean(identity.logos?.primary);
      const hasColors = identity.colors.primary !== "#8B5CF6";
      identity.confidence =
        hasLogo && hasColors ? "high" : hasLogo || hasColors ? "medium" : "low";

      // Update project with identity
      project.identity = identity as BrandIdentity;
      project.status = "designing";
      project.wizardStep = 2;
      project.updatedAt = new Date().toISOString();
      projectStore.set(projectId, project);

      console.log(
        `[brand-mcp] 🔍 Researched project: ${projectId} (confidence: ${identity.confidence})`,
      );

      return {
        success: true,
        project,
      };
    },
  });

/**
 * PROJECT_GENERATE - Generate design system for a project
 */
export const createProjectGenerateTool = (_env: Env) =>
  createTool({
    id: "PROJECT_GENERATE",
    _meta: { "ui/resourceUri": "ui://brand-preview" },
    description: `Generate design system files for a project.

Creates CSS, JSX, and style guide from the project's brand identity.`,
    inputSchema: z.object({
      projectId: z.string().describe("Project ID"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      project: BrandProjectSchema.optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const { projectId } = context;

      const project = projectStore.get(projectId);

      if (!project) {
        return {
          success: false,
          error: `Project not found: ${projectId}`,
        };
      }

      if (!project.identity) {
        return {
          success: false,
          error: "Project has no brand identity. Run research first.",
        };
      }

      // Import generator functions
      const {
        generateCSSVariables,
        generateDesignSystemJSX,
        generateStyleGuide,
      } = await import("./generator-utils.ts");

      project.css = generateCSSVariables(project.identity);
      project.jsx = generateDesignSystemJSX(project.identity);
      project.styleGuide = generateStyleGuide(project.identity);
      project.status = "complete";
      project.wizardStep = 3;
      project.updatedAt = new Date().toISOString();
      projectStore.set(projectId, project);

      console.log(`[brand-mcp] ✨ Generated design system for: ${projectId}`);

      return {
        success: true,
        project,
      };
    },
  });

export const projectTools = [
  createProjectCreateTool,
  createProjectListTool,
  createProjectGetTool,
  createProjectUpdateTool,
  createProjectDeleteTool,
  createProjectResearchTool,
  createProjectGenerateTool,
];
