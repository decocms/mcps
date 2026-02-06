/**
 * File Processor Module
 *
 * Handles downloading and processing attachments from Discord messages.
 * Supports images, audio, and text files (including PDF/DOCX).
 */

import type { Attachment } from "discord.js";

// ============================================================================
// Types
// ============================================================================

export interface ProcessedFile {
  type: "image" | "audio" | "text";
  data: string; // base64 for media, text content for text files
  mimeType: string;
  name: string;
}

export interface MediaFile {
  type: "image" | "audio";
  data: string; // base64
  mimeType: string;
  name: string;
}

export interface TextFile {
  name: string;
  content: string;
  mimeType: string;
  language?: string;
}

// ============================================================================
// File Type Detection
// ============================================================================

const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
];

const AUDIO_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
  "audio/flac",
];

const TEXT_MIME_TYPES = [
  "text/plain",
  "text/csv",
  "text/html",
  "text/css",
  "text/javascript",
  "text/markdown",
  "text/xml",
  "application/json",
  "application/xml",
  "application/yaml",
  "application/x-yaml",
];

const DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const TEXT_EXTENSIONS = [
  "txt",
  "json",
  "csv",
  "md",
  "markdown",
  "yaml",
  "yml",
  "js",
  "ts",
  "tsx",
  "jsx",
  "py",
  "rb",
  "go",
  "java",
  "c",
  "cpp",
  "h",
  "rs",
  "sh",
  "bash",
  "sql",
  "log",
  "env",
  "config",
  "conf",
  "xml",
  "html",
  "css",
];

/**
 * Check if a file is an image
 */
export function isImageFile(mimeType: string | null): boolean {
  if (!mimeType) return false;
  return IMAGE_MIME_TYPES.includes(mimeType.toLowerCase());
}

/**
 * Check if a file is audio
 */
export function isAudioFile(mimeType: string | null): boolean {
  if (!mimeType) return false;
  return AUDIO_MIME_TYPES.includes(mimeType.toLowerCase());
}

/**
 * Check if a file is a text file
 */
export function isTextFile(mimeType: string | null, filename: string): boolean {
  // Check by mime type
  if (mimeType && TEXT_MIME_TYPES.includes(mimeType.toLowerCase())) {
    return true;
  }

  // Check by file extension
  const ext = filename.toLowerCase().split(".").pop();
  return ext ? TEXT_EXTENSIONS.includes(ext) : false;
}

/**
 * Check if a file is a document (PDF/DOCX)
 */
export function isDocumentFile(mimeType: string | null): boolean {
  if (!mimeType) return false;
  return DOCUMENT_MIME_TYPES.includes(mimeType.toLowerCase());
}

/**
 * Get language identifier for syntax highlighting from filename
 */
export function getLanguageFromFilename(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop();
  const languageMap: Record<string, string> = {
    js: "javascript",
    ts: "typescript",
    tsx: "typescript",
    jsx: "javascript",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    c: "c",
    cpp: "cpp",
    h: "c",
    sh: "bash",
    bash: "bash",
    sql: "sql",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    html: "html",
    css: "css",
    xml: "xml",
    log: "log",
  };

  return ext && languageMap[ext] ? languageMap[ext] : "";
}

// ============================================================================
// File Download
// ============================================================================

/**
 * Download a file from Discord CDN
 */
export async function downloadFile(
  url: string,
): Promise<{ data: Buffer; mimeType: string } | null> {
  try {
    console.log(`[FileProcessor] Downloading: ${url.substring(0, 50)}...`);

    const response = await fetch(url);

    if (!response.ok) {
      console.error(
        `[FileProcessor] Failed to download: ${response.status} ${response.statusText}`,
      );
      return null;
    }

    const contentType =
      response.headers.get("content-type") ?? "application/octet-stream";
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(
      `[FileProcessor] Downloaded: ${buffer.length} bytes, type: ${contentType}`,
    );

    return {
      data: buffer,
      mimeType: contentType.split(";")[0].trim(),
    };
  } catch (error) {
    console.error("[FileProcessor] Download error:", error);
    return null;
  }
}

/**
 * Download and convert a media file to base64
 */
export async function downloadMediaFile(
  url: string,
  expectedMimeType: string,
  filename: string,
): Promise<MediaFile | null> {
  const downloaded = await downloadFile(url);
  if (!downloaded) return null;

  const isAudio = isAudioFile(expectedMimeType);
  const base64 = downloaded.data.toString("base64");

  return {
    type: isAudio ? "audio" : "image",
    data: base64,
    mimeType: expectedMimeType || downloaded.mimeType,
    name: filename,
  };
}

/**
 * Download a text file
 */
export async function downloadTextFile(
  url: string,
  filename: string,
  maxSize: number = 500_000,
): Promise<TextFile | null> {
  const downloaded = await downloadFile(url);
  if (!downloaded) return null;

  let textContent = downloaded.data.toString("utf-8");

  // Truncate if too large
  if (textContent.length > maxSize) {
    console.warn(
      `[FileProcessor] Text file truncated: ${textContent.length} > ${maxSize}`,
    );
    textContent = textContent.substring(0, maxSize) + "\n\n[... truncated]";
  }

  return {
    name: filename,
    content: textContent,
    mimeType: downloaded.mimeType,
    language: getLanguageFromFilename(filename),
  };
}

/**
 * Extract text from a PDF file
 */
async function extractTextFromPDF(buffer: Buffer): Promise<string | null> {
  try {
    // Dynamic import for pdf-parse
    const pdfParseModule = await import("pdf-parse");
    // @ts-ignore - pdf-parse has non-standard exports
    const pdfParse = pdfParseModule.default || pdfParseModule;
    const data = await pdfParse(buffer);
    return data.text;
  } catch (error) {
    console.error("[FileProcessor] PDF extraction error:", error);
    return null;
  }
}

/**
 * Extract text from a DOCX file
 */
async function extractTextFromDOCX(buffer: Buffer): Promise<string | null> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (error) {
    console.error("[FileProcessor] DOCX extraction error:", error);
    return null;
  }
}

/**
 * Download and extract text from a document (PDF/DOCX)
 */
export async function downloadDocumentFile(
  url: string,
  mimeType: string,
  filename: string,
  maxSize: number = 500_000,
): Promise<TextFile | null> {
  const downloaded = await downloadFile(url);
  if (!downloaded) return null;

  let extractedText: string | null = null;

  if (mimeType === "application/pdf") {
    console.log(`[FileProcessor] Extracting text from PDF: ${filename}`);
    extractedText = await extractTextFromPDF(downloaded.data);
  } else if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    console.log(`[FileProcessor] Extracting text from DOCX: ${filename}`);
    extractedText = await extractTextFromDOCX(downloaded.data);
  }

  if (!extractedText) {
    console.warn(`[FileProcessor] Could not extract text from: ${filename}`);
    return null;
  }

  // Truncate if too large
  if (extractedText.length > maxSize) {
    console.warn(
      `[FileProcessor] Extracted text truncated: ${extractedText.length} > ${maxSize}`,
    );
    extractedText = extractedText.substring(0, maxSize) + "\n\n[... truncated]";
  }

  return {
    name: filename,
    content: extractedText,
    mimeType,
    language: undefined,
  };
}

// ============================================================================
// Main Processing Function
// ============================================================================

/**
 * Process Discord attachments and return ready-to-use files for LLM
 */
export async function processDiscordAttachments(
  attachments: Attachment[],
): Promise<{
  media: MediaFile[];
  textFiles: TextFile[];
}> {
  const media: MediaFile[] = [];
  const textFiles: TextFile[] = [];

  for (const attachment of attachments) {
    const mimeType = attachment.contentType;
    const filename = attachment.name;
    const url = attachment.url;

    console.log(`[FileProcessor] Processing attachment:`, {
      name: filename,
      mimeType,
      size: attachment.size,
    });

    // Skip files that are too large (10MB limit)
    if (attachment.size > 10 * 1024 * 1024) {
      console.warn(`[FileProcessor] Skipping large file: ${filename}`);
      continue;
    }

    // Process images
    if (isImageFile(mimeType)) {
      const mediaFile = await downloadMediaFile(
        url,
        mimeType || "image/png",
        filename,
      );
      if (mediaFile) {
        media.push(mediaFile);
        console.log(`[FileProcessor] ✅ Processed image: ${filename}`);
      }
    }
    // Process audio
    else if (isAudioFile(mimeType)) {
      const mediaFile = await downloadMediaFile(
        url,
        mimeType || "audio/mpeg",
        filename,
      );
      if (mediaFile) {
        media.push(mediaFile);
        console.log(`[FileProcessor] ✅ Processed audio: ${filename}`);
      }
    }
    // Process documents (PDF/DOCX)
    else if (isDocumentFile(mimeType)) {
      const docFile = await downloadDocumentFile(url, mimeType!, filename);
      if (docFile) {
        textFiles.push(docFile);
        console.log(
          `[FileProcessor] ✅ Processed document: ${filename} (${docFile.content.length} chars)`,
        );
      }
    }
    // Process text files
    else if (isTextFile(mimeType, filename)) {
      const textFile = await downloadTextFile(url, filename);
      if (textFile) {
        textFiles.push(textFile);
        console.log(
          `[FileProcessor] ✅ Processed text file: ${filename} (${textFile.content.length} chars)`,
        );
      }
    } else {
      console.log(
        `[FileProcessor] Skipping unsupported file: ${filename} (${mimeType})`,
      );
    }
  }

  console.log(
    `[FileProcessor] Processed ${media.length} media files, ${textFiles.length} text files`,
  );

  return { media, textFiles };
}

/**
 * Format text files for inclusion in LLM prompt
 */
export function formatTextFilesForPrompt(textFiles: TextFile[]): string {
  if (textFiles.length === 0) return "";

  return textFiles
    .map((file) => {
      const language = file.language || "";
      return `[File: ${file.name}]\n\`\`\`${language}\n${file.content}\n\`\`\``;
    })
    .join("\n\n");
}
