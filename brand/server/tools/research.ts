/**
 * Brand Research Tools
 *
 * Uses Firecrawl and Perplexity to research and extract brand identity.
 */
import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";

/**
 * Brand identity schema
 */
export const BrandIdentitySchema = z.object({
  name: z.string().describe("Official brand name"),
  tagline: z.string().optional().describe("Brand tagline or slogan"),
  description: z.string().optional().describe("Brief brand description"),
  industry: z.string().optional().describe("Industry or sector"),
  founded: z.string().optional().describe("Year founded"),
  headquarters: z.string().optional().describe("Company headquarters"),

  colors: z
    .object({
      primary: z.string().describe("Primary brand color (hex)"),
      secondary: z.string().optional().describe("Secondary brand color (hex)"),
      accent: z.string().optional().describe("Accent color (hex)"),
      background: z.string().optional().describe("Background color (hex)"),
      text: z.string().optional().describe("Primary text color (hex)"),
      palette: z
        .array(z.string())
        .optional()
        .describe("Full color palette (hex values)"),
    })
    .describe("Brand color palette"),

  logos: z
    .object({
      primary: z.string().optional().describe("Primary logo URL"),
      light: z.string().optional().describe("Light logo for dark backgrounds"),
      dark: z.string().optional().describe("Dark logo for light backgrounds"),
      icon: z.string().optional().describe("Square icon/favicon URL"),
      alternates: z
        .array(z.string())
        .optional()
        .describe("Other logo variants"),
    })
    .optional()
    .describe("Logo image URLs"),

  typography: z
    .object({
      headingFont: z.string().optional().describe("Primary heading font"),
      bodyFont: z.string().optional().describe("Body text font"),
      monoFont: z.string().optional().describe("Monospace font"),
      fontWeights: z.array(z.string()).optional().describe("Common weights"),
      letterSpacing: z.string().optional().describe("Letter spacing style"),
    })
    .optional()
    .describe("Typography information"),

  style: z
    .object({
      aesthetic: z.string().optional().describe("Visual aesthetic"),
      mood: z.string().optional().describe("Brand mood/tone"),
      keywords: z.array(z.string()).optional().describe("Style keywords"),
      borderRadius: z.string().optional().describe("Border radius style"),
      shadows: z.string().optional().describe("Shadow style"),
    })
    .optional()
    .describe("Visual style attributes"),

  voice: z
    .object({
      tone: z.string().optional().describe("Communication tone"),
      personality: z
        .array(z.string())
        .optional()
        .describe("Brand personality traits"),
      values: z.array(z.string()).optional().describe("Core values"),
    })
    .optional()
    .describe("Brand voice and personality"),

  sources: z.array(z.string()).optional().describe("Research sources"),
  confidence: z.enum(["high", "medium", "low"]).describe("Confidence level"),
  rawData: z.unknown().optional().describe("Raw research data"),
});

export type BrandIdentity = z.infer<typeof BrandIdentitySchema>;

/**
 * BRAND_SCRAPE - Extract brand identity from a website using Firecrawl
 */
export const createBrandScrapeTool = (env: Env) =>
  createTool({
    id: "BRAND_SCRAPE",
    description: `Scrape a website to extract brand identity using Firecrawl.

Uses Firecrawl's 'branding' format to extract:
- Colors (primary, secondary, accent, background)
- Typography (fonts, weights, spacing)
- Logo images found on the page
- Visual style (aesthetic, shadows, border radius)

**Requires:** FIRECRAWL binding to be configured.

**Best for:** When you have the brand's website URL and want to extract their actual design system.`,
    inputSchema: z.object({
      url: z.string().url().describe("Website URL to scrape"),
      includeScreenshot: z
        .boolean()
        .optional()
        .describe("Also capture a screenshot"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      identity: BrandIdentitySchema.optional(),
      screenshot: z.string().optional().describe("Screenshot URL if requested"),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const { url, includeScreenshot } = context;

      const firecrawl = env.MESH_REQUEST_CONTEXT?.state?.FIRECRAWL;
      if (!firecrawl) {
        return {
          success: false,
          error:
            "FIRECRAWL binding not configured. Add the Firecrawl binding to enable website scraping.",
        };
      }

      try {
        const formats: string[] = ["branding", "links"];
        if (includeScreenshot) {
          formats.push("screenshot");
        }

        const result = (await firecrawl.firecrawl_scrape({
          url,
          formats,
        })) as {
          branding?: {
            colors?: Record<string, string>;
            fonts?: Record<string, string>;
            typography?: Record<string, unknown>;
            logos?: Record<string, string> | string[];
            style?: Record<string, unknown>;
          };
          links?: string[];
          screenshot?: string;
        };

        if (!result?.branding) {
          return {
            success: false,
            error: "No branding data extracted from the page",
          };
        }

        const branding = result.branding;

        // Parse colors
        const colors: BrandIdentity["colors"] = {
          primary:
            branding.colors?.primary || branding.colors?.main || "#000000",
          secondary: branding.colors?.secondary,
          accent: branding.colors?.accent,
          background: branding.colors?.background || branding.colors?.bg,
          text: branding.colors?.text,
          palette: Object.values(branding.colors || {}).filter(
            (c): c is string => typeof c === "string" && c.startsWith("#"),
          ),
        };

        // Parse logos
        let logos: BrandIdentity["logos"];
        if (branding.logos) {
          if (Array.isArray(branding.logos)) {
            logos = {
              primary: branding.logos[0],
              alternates: branding.logos.slice(1),
            };
          } else {
            logos = {
              primary: branding.logos.primary || branding.logos.main,
              light: branding.logos.light || branding.logos.white,
              dark: branding.logos.dark || branding.logos.black,
              icon: branding.logos.icon || branding.logos.favicon,
            };
          }
        }

        // Parse typography
        const typography: BrandIdentity["typography"] = {
          headingFont:
            branding.fonts?.heading ||
            branding.fonts?.title ||
            (branding.typography?.headingFont as string),
          bodyFont:
            branding.fonts?.body ||
            branding.fonts?.text ||
            (branding.typography?.bodyFont as string),
          monoFont: branding.fonts?.mono || branding.fonts?.code,
        };

        // Parse style
        const style: BrandIdentity["style"] = {
          borderRadius: branding.style?.borderRadius as string,
          shadows: branding.style?.shadows as string,
        };

        // Extract brand name from URL
        const urlObj = new URL(url);
        const brandName =
          urlObj.hostname.replace("www.", "").split(".")[0] || "Unknown Brand";

        const identity: BrandIdentity = {
          name: brandName.charAt(0).toUpperCase() + brandName.slice(1),
          colors,
          logos,
          typography,
          style,
          sources: [url],
          confidence:
            logos?.primary && colors.primary !== "#000000" ? "high" : "medium",
        };

        return {
          success: true,
          identity,
          screenshot: result.screenshot,
        };
      } catch (error) {
        return {
          success: false,
          error: `Scraping failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });

/**
 * BRAND_RESEARCH - Deep research on a brand using Perplexity
 */
export const createBrandResearchTool = (env: Env) =>
  createTool({
    id: "BRAND_RESEARCH",
    description: `Research a brand using Perplexity AI to gather comprehensive information.

Discovers:
- Brand history and background
- Color palette and visual identity
- Logo variations and assets
- Typography and design guidelines
- Brand voice and personality
- Industry positioning

**Requires:** PERPLEXITY binding to be configured.

**Best for:** When you need comprehensive brand information beyond what's visible on their website.`,
    inputSchema: z.object({
      brandName: z.string().describe("Brand or company name to research"),
      websiteUrl: z.string().url().optional().describe("Brand website URL"),
      focusAreas: z
        .array(z.enum(["visual", "voice", "history", "guidelines", "assets"]))
        .optional()
        .describe("Specific areas to focus research on"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      identity: BrandIdentitySchema.optional(),
      research: z.string().optional().describe("Full research text"),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const { brandName, websiteUrl, focusAreas } = context;

      const perplexity = env.MESH_REQUEST_CONTEXT?.state?.PERPLEXITY;
      if (!perplexity) {
        return {
          success: false,
          error:
            "PERPLEXITY binding not configured. Add the Perplexity binding to enable brand research.",
        };
      }

      try {
        const focusText = focusAreas?.length
          ? `Focus especially on: ${focusAreas.join(", ")}.`
          : "";

        const websiteText = websiteUrl
          ? ` Their website is ${websiteUrl}.`
          : "";

        const result = (await perplexity.perplexity_research({
          messages: [
            {
              role: "system",
              content: `You are a brand research expert. Extract comprehensive brand identity information in a structured way. Include specific hex color codes, font names, and URLs when found.`,
            },
            {
              role: "user",
              content: `Research the brand "${brandName}".${websiteText}

I need comprehensive information about:

1. **Brand Identity**
   - Official brand name and tagline
   - Industry and market position
   - Company history and founding

2. **Visual Identity**
   - Primary, secondary, and accent colors (with hex codes if available)
   - Logo variations and where to find them
   - Typography (heading fonts, body fonts)
   - Overall visual style and aesthetic

3. **Brand Voice**
   - Tone of communication
   - Key brand values
   - Personality traits

4. **Design Guidelines**
   - Any public brand guidelines or press kits
   - Logo usage rules
   - Color usage guidelines

${focusText}

Please provide specific details like hex color codes (#RRGGBB), font names, and URLs to logo assets when you can find them.`,
            },
          ],
          strip_thinking: true,
        })) as { response?: string };

        if (!result?.response) {
          return {
            success: false,
            error: "No research response received",
          };
        }

        // Parse the research response to extract structured data
        const response = result.response;

        // Try to extract colors from the response
        const hexColors = response.match(/#[0-9A-Fa-f]{6}/g) || [];
        const colors: BrandIdentity["colors"] = {
          primary: hexColors[0] || "#000000",
          secondary: hexColors[1],
          accent: hexColors[2],
          palette: [...new Set(hexColors)],
        };

        // Try to extract logo URLs
        const logoUrls =
          response.match(/https?:\/\/[^\s<>"]+\.(png|svg|jpg|jpeg|webp)/gi) ||
          [];
        const logos: BrandIdentity["logos"] = logoUrls.length
          ? {
              primary: logoUrls[0],
              alternates: logoUrls.slice(1),
            }
          : undefined;

        // Extract description (first paragraph-like content)
        const descMatch = response.match(/is\s+(?:a|an)\s+([^.]+\.)/i);
        const description = descMatch ? descMatch[0] : undefined;

        const identity: BrandIdentity = {
          name: brandName,
          description,
          colors,
          logos,
          sources: ["perplexity-research"],
          confidence: hexColors.length > 0 ? "medium" : "low",
          rawData: { research: response },
        };

        return {
          success: true,
          identity,
          research: response,
        };
      } catch (error) {
        return {
          success: false,
          error: `Research failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });

/**
 * BRAND_DISCOVER - Combined scraping and research for complete brand identity
 */
export const createBrandDiscoverTool = (env: Env) =>
  createTool({
    id: "BRAND_DISCOVER",
    description: `Comprehensive brand discovery combining web scraping and AI research.

This is the most complete tool - it:
1. Scrapes the brand website for visual identity (if FIRECRAWL available)
2. Researches the brand using AI (if PERPLEXITY available)
3. Combines results into a complete brand identity

**Best for:** Creating a complete brand profile with maximum information.`,
    inputSchema: z.object({
      brandName: z.string().describe("Brand or company name"),
      websiteUrl: z.string().url().describe("Brand website URL"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      identity: BrandIdentitySchema.optional(),
      scrapeData: z.unknown().optional(),
      researchData: z.unknown().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const { brandName, websiteUrl } = context;

      const firecrawl = env.MESH_REQUEST_CONTEXT?.state?.FIRECRAWL;
      const perplexity = env.MESH_REQUEST_CONTEXT?.state?.PERPLEXITY;

      if (!firecrawl && !perplexity) {
        return {
          success: false,
          error:
            "No research bindings available. Configure FIRECRAWL and/or PERPLEXITY bindings.",
        };
      }

      const identity: Partial<BrandIdentity> = {
        name: brandName,
        sources: [],
        confidence: "low",
      };

      let scrapeData: unknown;
      let researchData: unknown;

      // Step 1: Scrape the website
      if (firecrawl) {
        try {
          const scrapeResult = (await firecrawl.firecrawl_scrape({
            url: websiteUrl,
            formats: ["branding", "links"],
          })) as { branding?: Record<string, unknown>; links?: string[] };

          if (scrapeResult?.branding) {
            scrapeData = scrapeResult.branding;
            const branding = scrapeResult.branding;

            // Extract colors
            if (branding.colors && typeof branding.colors === "object") {
              const colors = branding.colors as Record<string, string>;
              identity.colors = {
                primary: colors.primary || colors.main || "#000000",
                secondary: colors.secondary,
                accent: colors.accent,
                background: colors.background,
                text: colors.text,
                palette: Object.values(colors).filter(
                  (c) => typeof c === "string" && c.startsWith("#"),
                ),
              };
            }

            // Extract logos
            if (branding.logos) {
              if (Array.isArray(branding.logos)) {
                identity.logos = {
                  primary: branding.logos[0] as string,
                  alternates: branding.logos.slice(1) as string[],
                };
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

            // Extract typography
            if (branding.fonts && typeof branding.fonts === "object") {
              const fonts = branding.fonts as Record<string, string>;
              identity.typography = {
                headingFont: fonts.heading || fonts.title,
                bodyFont: fonts.body || fonts.text,
                monoFont: fonts.mono,
              };
            }

            identity.sources?.push(websiteUrl);
            identity.confidence = identity.logos?.primary ? "high" : "medium";
          }
        } catch (error) {
          console.error("Scraping error:", error);
        }
      }

      // Step 2: Research the brand
      if (perplexity) {
        try {
          const researchResult = (await perplexity.perplexity_research({
            messages: [
              {
                role: "system",
                content:
                  "You are a brand research expert. Provide concise, factual information about the brand.",
              },
              {
                role: "user",
                content: `Tell me about ${brandName} (${websiteUrl}). Include:
1. Tagline or slogan
2. Industry and founding year
3. Brand colors (hex codes if known)
4. Brand personality and values
5. Any known brand guidelines or press kit URLs`,
              },
            ],
            strip_thinking: true,
          })) as { response?: string };

          if (researchResult?.response) {
            researchData = researchResult.response;
            const response = researchResult.response;

            // Extract tagline
            const taglineMatch = response.match(
              /(?:tagline|slogan)[:\s]+["']?([^"'\n.]+)["']?/i,
            );
            if (taglineMatch) {
              identity.tagline = taglineMatch[1].trim();
            }

            // Extract description
            if (!identity.description) {
              const descMatch = response.match(/is\s+(?:a|an)\s+([^.]+\.)/i);
              if (descMatch) {
                identity.description = descMatch[0];
              }
            }

            // Extract any colors we missed
            if (
              !identity.colors?.primary ||
              identity.colors.primary === "#000000"
            ) {
              const hexColors = response.match(/#[0-9A-Fa-f]{6}/g);
              if (hexColors?.length) {
                identity.colors = {
                  ...(identity.colors || {}),
                  primary: hexColors[0],
                  palette: [...new Set(hexColors)],
                };
              }
            }

            // Extract industry
            const industryMatch = response.match(
              /(?:industry|sector|space)[:\s]+([^.]+)/i,
            );
            if (industryMatch) {
              identity.industry = industryMatch[1].trim();
            }

            identity.sources?.push("perplexity-research");
          }
        } catch (error) {
          console.error("Research error:", error);
        }
      }

      // Determine final confidence
      const hasLogo = Boolean(identity.logos?.primary);
      const hasColors = Boolean(
        identity.colors?.primary && identity.colors.primary !== "#000000",
      );
      identity.confidence =
        hasLogo && hasColors ? "high" : hasLogo || hasColors ? "medium" : "low";

      return {
        success: true,
        identity: identity as BrandIdentity,
        scrapeData,
        researchData,
      };
    },
  });

/**
 * BRAND_STATUS - Check available research capabilities
 */
export const createBrandStatusTool = (env: Env) =>
  createTool({
    id: "BRAND_STATUS",
    description: `Check which brand research capabilities are available.

Returns the status of FIRECRAWL and PERPLEXITY bindings and what each enables.`,
    inputSchema: z.object({}),
    outputSchema: z.object({
      firecrawl: z.object({
        available: z.boolean(),
        capabilities: z.array(z.string()),
      }),
      perplexity: z.object({
        available: z.boolean(),
        capabilities: z.array(z.string()),
      }),
      recommendation: z.string(),
    }),
    execute: async () => {
      const firecrawl = env.MESH_REQUEST_CONTEXT?.state?.FIRECRAWL;
      const perplexity = env.MESH_REQUEST_CONTEXT?.state?.PERPLEXITY;

      return {
        firecrawl: {
          available: Boolean(firecrawl),
          capabilities: firecrawl
            ? [
                "Extract colors from website CSS",
                "Identify typography and fonts",
                "Find logo images",
                "Capture visual style",
                "Take screenshots",
              ]
            : [],
        },
        perplexity: {
          available: Boolean(perplexity),
          capabilities: perplexity
            ? [
                "Research brand history",
                "Find brand guidelines",
                "Discover logo URLs",
                "Analyze brand voice",
                "Find color palettes",
              ]
            : [],
        },
        recommendation:
          firecrawl && perplexity
            ? "Full capabilities available! Use BRAND_DISCOVER for complete brand profiles."
            : firecrawl
              ? "Firecrawl available for website scraping. Add Perplexity for deeper research."
              : perplexity
                ? "Perplexity available for research. Add Firecrawl for direct website extraction."
                : "No bindings configured. Add FIRECRAWL and/or PERPLEXITY bindings.",
      };
    },
  });

export const researchTools = [
  createBrandScrapeTool,
  createBrandResearchTool,
  createBrandDiscoverTool,
  createBrandStatusTool,
];
