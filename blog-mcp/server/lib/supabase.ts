/**
 * Supabase storage via MCP binding.
 * Uses the SUPABASE MCP binding for database operations.
 */

import type { Env } from "../main.ts";

export interface ContentRecord {
  id?: string;
  url: string;
  fingerprint: string;
  domain: string;
  title: string;
  first_seen_at: string;
  last_seen_at: string;
  updated_count: number;
}

export interface WatermarkRecord {
  domain: string;
  last_processed_at: string;
}

export interface DeduplicationResult {
  isNew: boolean;
  isUpdated: boolean;
  existingRecord?: ContentRecord;
}

/**
 * Create Supabase storage using MCP binding
 * The SUPABASE binding comes from the mesh and provides database operations
 */
export function createSupabaseStorage(env: Env) {
  const supabase = env.SUPABASE;

  return {
    /**
     * Check if content fingerprint already exists
     */
    async checkFingerprint(
      url: string,
      fingerprint: string,
    ): Promise<DeduplicationResult> {
      const result = await supabase.EXECUTE_SQL({
        query: `SELECT * FROM blog_content WHERE url = $1 LIMIT 1`,
        params: [url],
      });

      const data = result.rows?.[0] as ContentRecord | undefined;

      if (!data) {
        return { isNew: true, isUpdated: false };
      }

      if (data.fingerprint !== fingerprint) {
        return {
          isNew: false,
          isUpdated: true,
          existingRecord: data,
        };
      }

      return {
        isNew: false,
        isUpdated: false,
        existingRecord: data,
      };
    },

    /**
     * Save new content record
     */
    async saveContent(
      record: Omit<
        ContentRecord,
        "id" | "first_seen_at" | "last_seen_at" | "updated_count"
      >,
    ): Promise<ContentRecord> {
      const now = new Date().toISOString();

      const result = await supabase.EXECUTE_SQL({
        query: `
          INSERT INTO blog_content (url, fingerprint, domain, title, first_seen_at, last_seen_at, updated_count)
          VALUES ($1, $2, $3, $4, $5, $5, 0)
          RETURNING *
        `,
        params: [
          record.url,
          record.fingerprint,
          record.domain,
          record.title,
          now,
        ],
      });

      return result.rows?.[0] as ContentRecord;
    },

    /**
     * Update existing content record (fingerprint changed)
     */
    async updateContent(
      url: string,
      fingerprint: string,
      title: string,
    ): Promise<ContentRecord> {
      const now = new Date().toISOString();

      const result = await supabase.EXECUTE_SQL({
        query: `
          UPDATE blog_content 
          SET fingerprint = $1, title = $2, last_seen_at = $3, updated_count = updated_count + 1
          WHERE url = $4
          RETURNING *
        `,
        params: [fingerprint, title, now, url],
      });

      return result.rows?.[0] as ContentRecord;
    },

    /**
     * Get watermark (last_processed_at) for a domain
     */
    async getWatermark(domain: string): Promise<WatermarkRecord | null> {
      const result = await supabase.EXECUTE_SQL({
        query: `SELECT * FROM blog_watermarks WHERE domain = $1 LIMIT 1`,
        params: [domain],
      });

      return (result.rows?.[0] as WatermarkRecord) || null;
    },

    /**
     * Update watermark for a domain
     */
    async updateWatermark(domain: string): Promise<WatermarkRecord> {
      const now = new Date().toISOString();

      const result = await supabase.EXECUTE_SQL({
        query: `
          INSERT INTO blog_watermarks (domain, last_processed_at)
          VALUES ($1, $2)
          ON CONFLICT (domain) DO UPDATE SET last_processed_at = $2
          RETURNING *
        `,
        params: [domain, now],
      });

      return result.rows?.[0] as WatermarkRecord;
    },

    /**
     * Get all watermarks
     */
    async getAllWatermarks(): Promise<WatermarkRecord[]> {
      const result = await supabase.EXECUTE_SQL({
        query: `SELECT * FROM blog_watermarks ORDER BY last_processed_at DESC`,
        params: [],
      });

      return (result.rows || []) as WatermarkRecord[];
    },

    /**
     * Get content records by domain
     */
    async getContentByDomain(
      domain: string,
      limit = 100,
    ): Promise<ContentRecord[]> {
      const result = await supabase.EXECUTE_SQL({
        query: `
          SELECT * FROM blog_content 
          WHERE domain = $1 
          ORDER BY last_seen_at DESC 
          LIMIT $2
        `,
        params: [domain, limit],
      });

      return (result.rows || []) as ContentRecord[];
    },
  };
}

export type SupabaseStorage = ReturnType<typeof createSupabaseStorage>;
