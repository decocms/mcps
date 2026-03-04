/**
 * Markdown to Slack mrkdwn converter and Block Kit builder
 *
 * Converts standard Markdown to Slack's mrkdwn format.
 * https://api.slack.com/reference/surfaces/formatting
 */

import type { SlackBlock } from "./types.ts";

/**
 * Convert Markdown to Slack mrkdwn format
 */
export function markdownToSlack(markdown: string): string {
  if (!markdown) return markdown;

  let result = markdown;

  // Preserve code blocks first (we'll restore them later)
  const codeBlocks: string[] = [];
  result = result.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });

  // Preserve inline code
  const inlineCode: string[] = [];
  result = result.replace(/`[^`]+`/g, (match) => {
    inlineCode.push(match);
    return `__INLINE_CODE_${inlineCode.length - 1}__`;
  });

  // Convert headers (# Header → *Header*)
  result = result.replace(/^#{1,6}\s+(.+)$/gm, "*$1*");

  // Convert bold (**text** or __text__ → *text*)
  result = result.replace(/\*\*([^*]+)\*\*/g, "*$1*");
  result = result.replace(/__([^_]+)__/g, "*$1*");

  // Convert italic (*text* → _text_) - but not if it's already bold
  // This is tricky because Slack uses * for bold
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "_$1_");

  // Convert strikethrough (~~text~~ → ~text~)
  result = result.replace(/~~([^~]+)~~/g, "~$1~");

  // Convert links [text](url) → <url|text>
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<$2|$1>");

  // Convert unordered list items (- item or * item → • item)
  result = result.replace(/^[\s]*[-*]\s+/gm, "• ");

  // Convert ordered list items (1. item → 1. item) - Slack handles these OK
  // No change needed

  // Convert blockquotes (> text → > text) - Slack handles these OK
  // No change needed

  // Convert horizontal rules (--- or ***) → ───────
  result = result.replace(/^[-*]{3,}$/gm, "───────────────────");

  // Restore inline code
  for (let i = 0; i < inlineCode.length; i++) {
    result = result.replace(`__INLINE_CODE_${i}__`, inlineCode[i]);
  }

  // Restore code blocks
  for (let i = 0; i < codeBlocks.length; i++) {
    result = result.replace(`__CODE_BLOCK_${i}__`, codeBlocks[i]);
  }

  return result;
}

/**
 * Truncate text to a maximum length, adding ellipsis if needed
 */
export function truncateText(text: string, maxLength: number = 3000): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

/**
 * Ensure proper paragraph breaks in text
 * Detects sentences that end with punctuation followed directly by a capital letter
 * and adds line breaks between them
 */
export function ensureParagraphBreaks(text: string): string {
  if (!text) return text;

  // First, preserve existing double newlines
  let result = text;

  // Fix cases where sentences end with punctuation and immediately start a new sentence
  // e.g., "something.Something" → "something.\n\nSomething"
  // e.g., "something!Something" → "something!\n\nSomething"
  // e.g., "something?Something" → "something?\n\nSomething"
  result = result.replace(/([.!?])([A-Z])/g, "$1\n\n$2");

  // Fix cases where there's only one newline between paragraphs
  // Ensure double newlines for paragraph separation
  result = result.replace(/([.!?])\n([A-Z])/g, "$1\n\n$2");

  // Fix colon followed directly by capital letter (like "canais:Parece")
  result = result.replace(/:([A-Z])/g, ":\n\n$1");

  // Normalize multiple newlines to exactly two (for clean paragraphs)
  result = result.replace(/\n{3,}/g, "\n\n");

  return result;
}

/**
 * Format text for Slack, applying markdown conversion, paragraph breaks, and truncation
 */
export function formatForSlack(text: string, maxLength: number = 3000): string {
  // First ensure proper paragraph breaks
  const withParagraphs = ensureParagraphBreaks(text);
  // Then convert markdown
  const converted = markdownToSlack(withParagraphs);
  return truncateText(converted, maxLength);
}

// ============================================================================
// Block Kit Builder
// ============================================================================

/**
 * Create a section block with mrkdwn text
 */
export function createSectionBlock(text: string): SlackBlock {
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: truncateText(text, 3000),
    },
  };
}

/**
 * Create a divider block
 */
export function createDividerBlock(): SlackBlock {
  return { type: "divider" };
}

/**
 * Create a context block (for metadata/footer)
 */
export function createContextBlock(elements: string[]): SlackBlock {
  return {
    type: "context",
    elements: elements.map((text) => ({
      type: "mrkdwn",
      text,
    })),
  };
}

/**
 * Create an actions block with buttons
 */
export function createActionsBlock(
  buttons: Array<{
    text: string;
    actionId: string;
    style?: "primary" | "danger";
  }>,
): SlackBlock {
  return {
    type: "actions",
    elements: buttons.map((btn) => ({
      type: "button",
      text: {
        type: "plain_text",
        text: btn.text,
        emoji: true,
      },
      action_id: btn.actionId,
      ...(btn.style ? { style: btn.style } : {}),
    })),
  };
}

/**
 * Build rich blocks from LLM response
 * Intelligently formats the response with appropriate blocks
 */
export function buildResponseBlocks(
  response: string,
  options: {
    addFeedbackButtons?: boolean;
    addTimestamp?: boolean;
  } = {},
): SlackBlock[] {
  const blocks: SlackBlock[] = [];
  const formattedText = markdownToSlack(response);

  // Split response into sections if it's long
  const sections = splitIntoSections(formattedText);

  for (const section of sections) {
    if (section.trim()) {
      blocks.push(createSectionBlock(section));
    }
  }

  // Add feedback buttons if requested
  if (options.addFeedbackButtons) {
    blocks.push(
      createActionsBlock([
        { text: "👍 Útil", actionId: "feedback_helpful" },
        { text: "👎 Não útil", actionId: "feedback_not_helpful" },
      ]),
    );
  }

  // Add timestamp context if requested
  if (options.addTimestamp) {
    const timestamp = new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    blocks.push(createContextBlock([`⏱️ ${timestamp}`]));
  }

  return blocks;
}

/**
 * Split text into sections for Block Kit
 * Each section can be max 3000 chars
 */
function splitIntoSections(text: string): string[] {
  const MAX_SECTION_LENGTH = 2900; // Leave some margin
  const sections: string[] = [];

  // First, try to split by double newlines (paragraphs)
  const paragraphs = text.split(/\n\n+/);

  let currentSection = "";

  for (const paragraph of paragraphs) {
    if (currentSection.length + paragraph.length + 2 <= MAX_SECTION_LENGTH) {
      currentSection += (currentSection ? "\n\n" : "") + paragraph;
    } else {
      if (currentSection) {
        sections.push(currentSection);
      }

      // If single paragraph is too long, split by sentences
      if (paragraph.length > MAX_SECTION_LENGTH) {
        const chunks = splitLongText(paragraph, MAX_SECTION_LENGTH);
        sections.push(...chunks.slice(0, -1));
        currentSection = chunks[chunks.length - 1] ?? "";
      } else {
        currentSection = paragraph;
      }
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Split long text into chunks, trying to break at sentence boundaries
 */
function splitLongText(text: string, maxLength: number): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    // Find the last sentence break before maxLength
    let splitPoint = remaining.lastIndexOf(". ", maxLength);
    if (splitPoint === -1 || splitPoint < maxLength / 2) {
      // No good sentence break, try newline
      splitPoint = remaining.lastIndexOf("\n", maxLength);
    }
    if (splitPoint === -1 || splitPoint < maxLength / 2) {
      // No good break point, just split at maxLength
      splitPoint = maxLength;
    }

    chunks.push(remaining.slice(0, splitPoint + 1).trim());
    remaining = remaining.slice(splitPoint + 1).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}
