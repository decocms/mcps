/**
 * Brand research tools that use optional Perplexity and Firecrawl bindings.
 *
 * These tools automatically discover brand assets (logos, colors, typography)
 * from websites when the corresponding bindings are configured.
 */
import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";

/**
 * Schema for extracted brand assets from research.
 */
const BrandResearchResultSchema = z.object({
  brandName: z.string().describe("Official brand name"),
  tagline: z.string().optional().describe("Brand tagline or slogan"),
  description: z.string().optional().describe("Brief brand description"),

  // Colors
  colors: z
    .object({
      primary: z.string().optional().describe("Primary brand color (hex)"),
      secondary: z.string().optional().describe("Secondary brand color (hex)"),
      accent: z.string().optional().describe("Accent color (hex)"),
      background: z
        .string()
        .optional()
        .describe("Background color preference (hex)"),
      text: z.string().optional().describe("Primary text color (hex)"),
      palette: z
        .array(z.string())
        .optional()
        .describe("Full color palette (hex values)"),
    })
    .optional()
    .describe("Brand color palette"),

  // Logo URLs
  logos: z
    .object({
      primary: z.string().optional().describe("Primary logo URL"),
      light: z
        .string()
        .optional()
        .describe("Light/white logo URL for dark backgrounds"),
      dark: z
        .string()
        .optional()
        .describe("Dark/black logo URL for light backgrounds"),
      icon: z.string().optional().describe("Square icon/favicon URL"),
      alternates: z
        .array(z.string())
        .optional()
        .describe("Other logo variants found"),
    })
    .optional()
    .describe("Logo image URLs discovered"),

  // Typography
  typography: z
    .object({
      headingFont: z.string().optional().describe("Primary heading font"),
      bodyFont: z.string().optional().describe("Body text font"),
      fontWeights: z
        .array(z.string())
        .optional()
        .describe("Common font weights used"),
    })
    .optional()
    .describe("Typography information"),

  // Visual style
  style: z
    .object({
      aesthetic: z
        .string()
        .optional()
        .describe("Overall visual aesthetic (e.g., modern, minimal, bold)"),
      industry: z.string().optional().describe("Industry or sector"),
      mood: z.string().optional().describe("Brand mood/tone"),
    })
    .optional()
    .describe("Visual style attributes"),

  // Sources
  sources: z
    .array(z.string())
    .optional()
    .describe("URLs where information was found"),

  // Research metadata
  researchMethod: z
    .enum(["perplexity", "firecrawl", "both", "none"])
    .describe("Which binding(s) were used for research"),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe("Confidence level in the extracted data"),
  rawData: z.unknown().optional().describe("Raw data from research tools"),
});

/**
 * BRAND_RESEARCH - Automatically research and discover brand assets
 *
 * This tool uses Perplexity and/or Firecrawl bindings (when configured) to:
 * 1. Research brand information from the web
 * 2. Extract brand identity from the website (colors, fonts, logos)
 * 3. Find logo image URLs
 *
 * If no bindings are configured, returns instructions for manual asset collection.
 */
export const createBrandResearchTool = (env: Env) =>
  createTool({
    id: "BRAND_RESEARCH",
    description: `Automatically research and discover brand assets from a website.

**Requires:** At least one of PERPLEXITY or FIRECRAWL bindings to be configured.

**What it does:**
1. **With FIRECRAWL:** Scrapes the website to extract brand identity (colors, typography, logos)
   - Uses the 'branding' format for comprehensive design system extraction
   - Finds logo images in the page source
   
2. **With PERPLEXITY:** Searches for additional brand information
   - Finds official logo URLs from brand asset pages
   - Discovers brand guidelines and color palettes
   - Gets brand taglines and descriptions

3. **With both:** Combines results for most comprehensive brand research

**Returns:** Structured brand data including logos, colors, typography, and style.

**Use before DECK_INIT** to automatically populate brand assets.`,
    inputSchema: z.object({
      brandName: z.string().describe("Brand/company name to research"),
      websiteUrl: z
        .string()
        .optional()
        .describe("Brand website URL (e.g., 'https://example.com')"),
      includeCompetitorAnalysis: z
        .boolean()
        .optional()
        .describe("Also research competitor brands for comparison"),
    }),
    outputSchema: z.object({
      result: BrandResearchResultSchema,
      bindingsAvailable: z.object({
        perplexity: z.boolean(),
        firecrawl: z.boolean(),
      }),
      instructions: z
        .string()
        .optional()
        .describe("Manual instructions if no bindings available"),
    }),
    execute: async ({ context }) => {
      const { brandName, websiteUrl } = context;

      // Check which bindings are available (accessed via closure from env)
      const perplexity = env.MESH_REQUEST_CONTEXT?.state?.PERPLEXITY;
      const firecrawl = env.MESH_REQUEST_CONTEXT?.state?.FIRECRAWL;

      const hasPerplexity = Boolean(perplexity);
      const hasFirecrawl = Boolean(firecrawl);

      // If no bindings, return instructions for manual collection
      if (!hasPerplexity && !hasFirecrawl) {
        return {
          result: {
            brandName,
            researchMethod: "none" as const,
            confidence: "low" as const,
          },
          bindingsAvailable: {
            perplexity: false,
            firecrawl: false,
          },
          instructions: `No research bindings configured. To enable automatic brand research:

1. **Add Perplexity binding** (recommended for logo discovery):
   - Searches the web for brand logos and guidelines
   - Finds official logo asset pages
   
2. **Add Firecrawl binding** (recommended for brand identity):
   - Extracts colors, fonts, and typography from websites
   - Finds logo URLs in page source

**Manual alternative:**
Ask the user for:
- Logo image URL (PNG/SVG with transparent background)
- Primary brand color (hex, e.g., #8B5CF6)
- Light logo version for dark backgrounds (optional)
- Dark logo version for light backgrounds (optional)

${websiteUrl ? `\nYou can also manually check ${websiteUrl} for:\n- /logo.png or /logo.svg\n- Favicon at /favicon.ico\n- <meta property="og:image"> tag\n- CSS for brand colors` : ""}`,
        };
      }

      // Initialize result
      let result: z.infer<typeof BrandResearchResultSchema> = {
        brandName,
        researchMethod:
          hasPerplexity && hasFirecrawl
            ? "both"
            : hasFirecrawl
              ? "firecrawl"
              : "perplexity",
        confidence: "medium",
        sources: [],
      };

      // FIRECRAWL: Extract brand identity from website
      if (hasFirecrawl && websiteUrl && firecrawl) {
        try {
          // Use the 'branding' format to extract brand identity
          const brandingResult = await firecrawl.firecrawl_scrape({
            url: websiteUrl,
            formats: ["branding", "links"],
            onlyMainContent: false,
            maxAge: 86400000, // 24 hour cache
          });

          if (brandingResult) {
            const data = brandingResult as Record<string, unknown>;

            // Extract branding data
            if (data.branding) {
              const branding = data.branding as Record<string, unknown>;

              // Extract colors
              if (branding.colors || branding.colorPalette) {
                const colors = (branding.colors || branding.colorPalette) as
                  | string[]
                  | Record<string, string>;
                if (Array.isArray(colors)) {
                  result.colors = {
                    primary: colors[0],
                    secondary: colors[1],
                    accent: colors[2],
                    palette: colors,
                  };
                } else if (typeof colors === "object") {
                  result.colors = {
                    primary: colors.primary || colors.main,
                    secondary: colors.secondary,
                    accent: colors.accent,
                    background: colors.background,
                    text: colors.text,
                  };
                }
              }

              // Extract typography
              if (branding.fonts || branding.typography) {
                const fonts = (branding.fonts || branding.typography) as
                  | string[]
                  | Record<string, string>;
                if (Array.isArray(fonts)) {
                  result.typography = {
                    headingFont: fonts[0],
                    bodyFont: fonts[1] || fonts[0],
                  };
                } else if (typeof fonts === "object") {
                  result.typography = {
                    headingFont: fonts.heading || fonts.primary,
                    bodyFont: fonts.body || fonts.secondary,
                  };
                }
              }

              // Extract logo if available
              if (branding.logo || branding.logos) {
                const logos = branding.logo || branding.logos;
                if (typeof logos === "string") {
                  result.logos = { primary: logos };
                } else if (typeof logos === "object") {
                  const logosObj = logos as Record<string, string>;
                  result.logos = {
                    primary:
                      logosObj.primary || logosObj.main || logosObj.default,
                    light: logosObj.light || logosObj.white,
                    dark: logosObj.dark || logosObj.black,
                    icon: logosObj.icon || logosObj.favicon,
                  };
                }
              }
            }

            // Try to find logo in links
            if (data.links && Array.isArray(data.links)) {
              const logoLinks = (data.links as string[]).filter(
                (link) =>
                  /logo/i.test(link) &&
                  /\.(png|svg|jpg|jpeg|webp)$/i.test(link),
              );
              if (logoLinks.length > 0 && !result.logos?.primary) {
                result.logos = {
                  ...result.logos,
                  primary: logoLinks[0],
                  alternates: logoLinks.slice(1),
                };
              }
            }

            result.sources = [...(result.sources || []), websiteUrl];
            result.rawData = { firecrawl: data };
          }
        } catch (error) {
          console.error("Firecrawl brand extraction failed:", error);
        }
      }

      // PERPLEXITY: Search for additional brand information
      if (hasPerplexity && perplexity) {
        try {
          // Research query for brand assets
          const researchPrompt = `Research the brand "${brandName}"${websiteUrl ? ` (website: ${websiteUrl})` : ""} and provide:

1. **Official Logo URLs**: Find direct URLs to the brand's logo images. Look for:
   - Press kit or media kit pages
   - Brand guidelines pages  
   - About pages with downloadable assets
   - SVG or PNG logo files

2. **Brand Colors**: Find the exact hex color codes for:
   - Primary brand color
   - Secondary colors
   - Accent colors

3. **Brand Identity**: 
   - Official tagline or slogan
   - Brand description
   - Visual style (modern, minimal, corporate, playful, etc.)

4. **Typography**: 
   - Primary fonts used
   - Any custom or brand-specific fonts

Please provide specific URLs and exact hex color codes where possible.
Format logo URLs as full URLs (e.g., https://example.com/logo.svg).`;

          const researchResult = (await perplexity.perplexity_research({
            messages: [
              {
                role: "system",
                content:
                  "You are a brand research expert. Find specific, actionable brand assets including logo URLs and color codes. Always provide full URLs for images.",
              },
              {
                role: "user",
                content: researchPrompt,
              },
            ],
            strip_thinking: true,
          })) as { response?: string } | undefined;

          if (researchResult?.response) {
            const response = researchResult.response;

            // Parse colors from response (look for hex patterns)
            const hexPattern = /#[0-9A-Fa-f]{6}\b/g;
            const foundColors = response.match(hexPattern);
            if (foundColors && foundColors.length > 0) {
              result.colors = {
                ...result.colors,
                primary: result.colors?.primary || foundColors[0],
                secondary: result.colors?.secondary || foundColors[1],
                accent: result.colors?.accent || foundColors[2],
                palette: [
                  ...(result.colors?.palette || []),
                  ...foundColors.filter(
                    (c: string) => !result.colors?.palette?.includes(c),
                  ),
                ].slice(0, 8),
              };
            }

            // Parse logo URLs from response
            const urlPattern =
              /https?:\/\/[^\s<>"{}|\\^`\[\]]+\.(png|svg|jpg|jpeg|webp)/gi;
            const foundUrls = response.match(urlPattern);
            if (foundUrls && foundUrls.length > 0) {
              const logoUrls = foundUrls.filter(
                (url: string) =>
                  /logo|brand|icon|mark/i.test(url) ||
                  /assets|media|press|brand/i.test(url),
              );
              if (logoUrls.length > 0) {
                result.logos = {
                  ...result.logos,
                  primary: result.logos?.primary || logoUrls[0],
                  alternates: [
                    ...(result.logos?.alternates || []),
                    ...logoUrls.slice(1),
                  ],
                };
              }
            }

            // Try to extract tagline
            const taglineMatch = response.match(
              /tagline[:\s]+["']?([^"'\n.]+)["']?/i,
            );
            if (taglineMatch) {
              result.tagline = result.tagline || taglineMatch[1].trim();
            }

            // Extract description
            const descMatch = response.match(
              /(?:description|about|is a)[:\s]+([^.]+\.)/i,
            );
            if (descMatch) {
              result.description = result.description || descMatch[1].trim();
            }

            result.sources = [...(result.sources || []), "perplexity-research"];
            result.rawData = {
              ...((result.rawData as Record<string, unknown>) || {}),
              perplexity: response,
            };
          }
        } catch (error) {
          console.error("Perplexity research failed:", error);
        }

        // Also do a targeted search for logo URLs
        try {
          const searchResult = (await perplexity.perplexity_search({
            query: `${brandName} logo SVG PNG download official`,
            max_results: 5,
          })) as { results?: string } | undefined;

          if (searchResult?.results) {
            // Parse any URLs from search results
            const urlPattern = /https?:\/\/[^\s<>"{}|\\^`\[\]]+\.(png|svg)/gi;
            const foundUrls = searchResult.results.match(urlPattern);
            if (foundUrls && foundUrls.length > 0) {
              result.logos = {
                ...result.logos,
                alternates: [
                  ...(result.logos?.alternates || []),
                  ...foundUrls.filter(
                    (url: string) =>
                      url !== result.logos?.primary &&
                      !result.logos?.alternates?.includes(url),
                  ),
                ].slice(0, 5),
              };
            }
          }
        } catch (error) {
          console.error("Perplexity logo search failed:", error);
        }
      }

      // Determine confidence level
      const hasLogo = Boolean(result.logos?.primary);
      const hasColors = Boolean(result.colors?.primary);

      result.confidence =
        hasLogo && hasColors ? "high" : hasLogo || hasColors ? "medium" : "low";

      return {
        result,
        bindingsAvailable: {
          perplexity: hasPerplexity,
          firecrawl: hasFirecrawl,
        },
        instructions:
          result.confidence === "low"
            ? `Limited brand data found. Consider:
1. Manually check ${websiteUrl || "the brand website"} for logo files
2. Ask the user for brand guidelines or logo files
3. Check the brand's press kit or media page`
            : undefined,
      };
    },
  });

/**
 * BRAND_RESEARCH_STATUS - Check if research bindings are available
 */
export const createBrandResearchStatusTool = (env: Env) =>
  createTool({
    id: "BRAND_RESEARCH_STATUS",
    description: `Check which brand research bindings are available.

Returns the status of PERPLEXITY and FIRECRAWL bindings, and explains
what capabilities are available for automatic brand research.`,
    inputSchema: z.object({}),
    outputSchema: z.object({
      bindings: z.object({
        perplexity: z.object({
          available: z.boolean(),
          capabilities: z.array(z.string()),
        }),
        firecrawl: z.object({
          available: z.boolean(),
          capabilities: z.array(z.string()),
        }),
      }),
      canResearchBrands: z.boolean(),
      recommendation: z.string(),
    }),
    execute: async () => {
      // Access bindings via closure from env
      const perplexity = env.MESH_REQUEST_CONTEXT?.state?.PERPLEXITY;
      const firecrawl = env.MESH_REQUEST_CONTEXT?.state?.FIRECRAWL;

      const hasPerplexity = Boolean(perplexity);
      const hasFirecrawl = Boolean(firecrawl);

      return {
        bindings: {
          perplexity: {
            available: hasPerplexity,
            capabilities: hasPerplexity
              ? [
                  "Search for brand logo URLs",
                  "Research brand colors and guidelines",
                  "Find brand taglines and descriptions",
                  "Discover press kits and media pages",
                ]
              : [],
          },
          firecrawl: {
            available: hasFirecrawl,
            capabilities: hasFirecrawl
              ? [
                  "Extract brand colors from website CSS",
                  "Identify typography and fonts",
                  "Find logo images in page source",
                  "Capture full brand identity from live website",
                ]
              : [],
          },
        },
        canResearchBrands: hasPerplexity || hasFirecrawl,
        recommendation:
          hasPerplexity && hasFirecrawl
            ? "Full brand research available! Use BRAND_RESEARCH tool to automatically discover logos, colors, and typography."
            : hasFirecrawl
              ? "Firecrawl available for website brand extraction. Add Perplexity for better logo URL discovery."
              : hasPerplexity
                ? "Perplexity available for brand research. Add Firecrawl for direct website brand extraction."
                : "No research bindings configured. Add PERPLEXITY or FIRECRAWL bindings to enable automatic brand research. See documentation for setup instructions.",
      };
    },
  });

// Export all brand research tools
export const brandResearchTools = [
  createBrandResearchTool,
  createBrandResearchStatusTool,
];
