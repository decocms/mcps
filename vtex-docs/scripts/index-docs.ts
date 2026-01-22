import { createClient } from "@supabase/supabase-js";
import { Glob } from "bun";
import { embedMany } from "ai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { embeddingModel } from "../server/lib/mesh-provider";

// Configuration
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const BATCH_SIZE = 50;

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Markdown-aware text splitter
const splitter = RecursiveCharacterTextSplitter.fromLanguage("markdown", {
  chunkSize: CHUNK_SIZE,
  chunkOverlap: CHUNK_OVERLAP,
});

interface Frontmatter {
  title?: string;
  description?: string;
}

interface DocChunk {
  content: string;
  metadata: {
    source: string;
    title: string;
    description?: string;
    language: string;
    section: string;
  };
}

// Contextual Chunking: adds document context to chunk for better embeddings
function createContextualText(chunk: DocChunk): string {
  const { title, section, description } = chunk.metadata;

  const parts = [`Document: ${title}`];
  if (section) parts.push(`Category: ${section}`);
  if (description) parts.push(`Description: ${description}`);

  const context = parts.join(" | ");
  return `${context}\n\n${chunk.content}`;
}

function parseFrontmatter(content: string): {
  frontmatter: Frontmatter;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const [, fm, body] = match;
  const frontmatter: Frontmatter = {};

  for (const line of fm.split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      let value = line.slice(idx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      frontmatter[key as keyof Frontmatter] = value;
    }
  }

  return { frontmatter, body };
}

function extractLanguage(path: string): string {
  if (path.includes("/pt/") || path.includes("/pt-br/")) return "pt-br";
  if (path.includes("/en/")) return "en";
  return "en"; // Default to English for VTEX docs
}

function extractSection(path: string): string {
  // Extract section from path like docs/guides/vtex-io/...
  const parts = path.split("/");
  const docsIndex = parts.findIndex((p) => p === "docs");
  if (docsIndex >= 0 && parts.length > docsIndex + 2) {
    return parts.slice(docsIndex + 1, -1).join("/");
  }
  return "";
}

async function processFile(filePath: string): Promise<DocChunk[]> {
  const content = await Bun.file(filePath).text();
  const { frontmatter, body } = parseFrontmatter(content);

  const language = extractLanguage(filePath);
  const section = extractSection(filePath);
  const title =
    frontmatter.title ||
    filePath.split("/").pop()?.replace(/\.(mdx?|md)$/, "") ||
    "Untitled";

  const chunks = await splitter.splitText(body);

  return chunks.map((chunk) => ({
    content: chunk,
    metadata: {
      source: filePath,
      title,
      description: frontmatter.description,
      language,
      section,
    },
  }));
}

async function deleteExistingChunks(source: string): Promise<void> {
  await supabase.from("vtex_docs_chunks").delete().eq("metadata->>source", source);
}

async function insertChunks(
  chunks: DocChunk[],
  vectors: number[][]
): Promise<void> {
  const rows = chunks.map((chunk, i) => ({
    content: chunk.content,
    metadata: chunk.metadata,
    embedding: vectors[i],
  }));

  const { error } = await supabase.from("vtex_docs_chunks").insert(rows);
  if (error) throw new Error(`Insert failed: ${error.message}`);
}

async function indexDocs(): Promise<void> {
  const docsPath = process.argv[2] || "./docs";

  console.log(`Starting indexing from: ${docsPath}\n`);

  // Support both .md and .mdx files
  const glob = new Glob(`${docsPath}/**/*.{md,mdx}`);
  const files: string[] = [];
  for await (const file of glob.scan(".")) {
    files.push(file);
  }

  console.log(`Found ${files.length} files\n`);

  if (files.length === 0) {
    console.log("No files found. Make sure the docs path is correct.");
    return;
  }

  let totalChunks = 0;

  for (const file of files) {
    try {
      console.log(`Processing: ${file}`);

      await deleteExistingChunks(file);
      const chunks = await processFile(file);

      if (chunks.length === 0) {
        console.log(`  Skipped (no content)\n`);
        continue;
      }

      // Process in batches
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);

        // Contextual Chunking: embed with context, store without
        const textsWithContext = batch.map(createContextualText);

        const { embeddings } = await embedMany({
          model: embeddingModel(),
          values: textsWithContext,
        });

        await insertChunks(batch, embeddings);
      }

      totalChunks += chunks.length;
      console.log(`  ${chunks.length} chunks indexed\n`);
    } catch (err) {
      console.error(`  Error: ${err}\n`);
    }
  }

  console.log(`\nDone! ${totalChunks} total chunks created`);
}

indexDocs().catch(console.error);
