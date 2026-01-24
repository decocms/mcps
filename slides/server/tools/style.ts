/**
 * Style guide management tools for slide presentations.
 *
 * These tools handle reading and updating the style.md file that
 * defines the visual style, tone, and design system for presentations.
 */
import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";

/**
 * STYLE_GET - Get the current style guide content
 */
export const createStyleGetTool = (_env: Env) =>
  createTool({
    id: "STYLE_GET",
    description:
      "Get the current style guide content. The style.md file defines the visual style, tone, and design system for the presentation.",
    inputSchema: z.object({
      content: z.string().describe("Current content of the style.md file"),
    }),
    outputSchema: z.object({
      styleGuide: z.string().describe("The style guide content"),
      sections: z
        .array(
          z.object({
            heading: z.string(),
            content: z.string(),
          }),
        )
        .optional()
        .describe("Parsed sections of the style guide"),
    }),
    execute: async ({ context }) => {
      const { content } = context;

      // Parse sections from markdown
      const lines = content.split("\n");
      const sections: { heading: string; content: string }[] = [];
      let currentHeading = "";
      let currentContent: string[] = [];

      for (const line of lines) {
        if (line.startsWith("## ")) {
          if (currentHeading) {
            sections.push({
              heading: currentHeading,
              content: currentContent.join("\n").trim(),
            });
          }
          currentHeading = line.replace("## ", "").trim();
          currentContent = [];
        } else if (currentHeading) {
          currentContent.push(line);
        }
      }

      // Add last section
      if (currentHeading) {
        sections.push({
          heading: currentHeading,
          content: currentContent.join("\n").trim(),
        });
      }

      return {
        styleGuide: content,
        sections,
      };
    },
  });

/**
 * STYLE_SET - Update the style guide content
 */
export const createStyleSetTool = (_env: Env) =>
  createTool({
    id: "STYLE_SET",
    description:
      "Update the style guide content. This defines the visual style, tone, and design system for the presentation. Returns the new content to write to style.md.",
    inputSchema: z.object({
      content: z
        .string()
        .describe("New style guide content in markdown format"),
    }),
    outputSchema: z.object({
      content: z
        .string()
        .describe("The style guide content to write to style.md"),
      message: z.string().describe("Success message"),
    }),
    execute: async ({ context }) => {
      const { content } = context;

      // Validate that it looks like a style guide
      if (!content.includes("#") && content.length < 50) {
        throw new Error(
          "Style guide should be in markdown format with sections (using # or ## headings)",
        );
      }

      return {
        content,
        message: "Style guide updated successfully.",
      };
    },
  });

/**
 * STYLE_SUGGEST - Generate style guide suggestions based on presentation topic
 */
export const createStyleSuggestTool = (_env: Env) =>
  createTool({
    id: "STYLE_SUGGEST",
    description:
      "Generate style guide suggestions based on the presentation topic and purpose.",
    inputSchema: z.object({
      topic: z.string().describe("The main topic or theme of the presentation"),
      purpose: z
        .enum(["investor", "sales", "educational", "internal", "conference"])
        .describe("The purpose of the presentation"),
      tone: z
        .enum(["formal", "casual", "technical", "inspirational"])
        .optional()
        .default("formal")
        .describe("Desired tone of the presentation"),
    }),
    outputSchema: z.object({
      suggestedStyle: z.string().describe("Suggested style guide content"),
      recommendations: z
        .array(z.string())
        .describe("Key recommendations for this type of presentation"),
    }),
    execute: async ({ context }) => {
      const { topic, purpose, tone } = context;

      const toneDescriptions = {
        formal: "Professional and polished, suitable for executive audiences",
        casual: "Relaxed and approachable, with conversational language",
        technical: "Detailed and precise, with technical terminology",
        inspirational: "Motivational and engaging, with powerful statements",
      };

      const purposeLayouts = {
        investor: ["title", "stats", "timeline", "two-column", "list"],
        sales: ["title", "stats", "image", "quote", "list"],
        educational: ["title", "content", "two-column", "list", "image"],
        internal: ["title", "content", "list", "stats", "two-column"],
        conference: ["title", "image", "quote", "stats", "content"],
      };

      const recommendations = {
        investor: [
          "Lead with key metrics and growth numbers",
          "Use timeline slides to show company journey",
          "Include clear asks and next steps",
          "Keep slides data-driven but not cluttered",
        ],
        sales: [
          "Focus on customer value and outcomes",
          "Include testimonials or case studies",
          "Use stats to build credibility",
          "End with clear call to action",
        ],
        educational: [
          "Break complex topics into digestible chunks",
          "Use examples and illustrations",
          "Include key takeaways on each section",
          "Maintain consistent terminology",
        ],
        internal: [
          "Be transparent about challenges and solutions",
          "Include actionable next steps",
          "Credit team contributions",
          "Keep it focused and time-efficient",
        ],
        conference: [
          "Start with a hook that captures attention",
          "Use large, readable text for distant audiences",
          "Include memorable quotes or statistics",
          "End with a strong, shareable takeaway",
        ],
      };

      const suggestedStyle = `# ${topic} - Presentation Style Guide

## Purpose & Audience
${purpose.charAt(0).toUpperCase() + purpose.slice(1)} presentation
${toneDescriptions[tone]}

## Brand Colors

- **Primary Accent**: Green (#c4df1b) - Used for emphasis and key points
- **Secondary Accent**: Purple (#d4a5ff) - Used for alternative sections  
- **Tertiary Accent**: Yellow (#ffd666) - Used for highlights

## Typography

- **Headlines**: Large, bold, with tight letter-spacing
- **Body Text**: Clean, readable, 17-18px
- **Monospace**: For tags and technical content

## Recommended Slide Layouts

${purposeLayouts[purpose].map((l, i) => `${i + 1}. **${l}** - Use for ${l === "title" ? "section breaks" : l === "stats" ? "key metrics" : l === "image" ? "visual impact" : l === "quote" ? "testimonials" : l === "list" ? "action items" : "detailed content"}`).join("\n")}

## Tone & Voice

- ${toneDescriptions[tone]}
- Clear, concise language
- ${purpose === "investor" ? "Data-driven with strategic context" : purpose === "sales" ? "Value-focused and persuasive" : purpose === "educational" ? "Explanatory and progressive" : purpose === "conference" ? "Engaging and memorable" : "Direct and actionable"}

## Best Practices

${recommendations[purpose].map((r) => `- ${r}`).join("\n")}
`;

      return {
        suggestedStyle,
        recommendations: recommendations[purpose],
      };
    },
  });

// Export all style tools
export const styleTools = [
  createStyleGetTool,
  createStyleSetTool,
  createStyleSuggestTool,
];
