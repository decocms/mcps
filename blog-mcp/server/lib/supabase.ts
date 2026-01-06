/**
 * Supabase client for state persistence.
 * Handles content fingerprints, watermarks, and deduplication.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

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
 * Create Supabase storage client for blog content state
 */
export function createSupabaseStorage(
  supabaseUrl: string,
  supabaseKey: string,
) {
  const client: SupabaseClient = createClient(supabaseUrl, supabaseKey);

  return {
    /**
     * Check if content fingerprint already exists
     */
    async checkFingerprint(
      url: string,
      fingerprint: string,
    ): Promise<DeduplicationResult> {
      const { data, error } = await client
        .from("blog_content")
        .select("*")
        .eq("url", url)
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to check fingerprint: ${error.message}`);
      }

      if (!data) {
        return { isNew: true, isUpdated: false };
      }

      if (data.fingerprint !== fingerprint) {
        return {
          isNew: false,
          isUpdated: true,
          existingRecord: data as ContentRecord,
        };
      }

      return {
        isNew: false,
        isUpdated: false,
        existingRecord: data as ContentRecord,
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
      const newRecord = {
        ...record,
        first_seen_at: now,
        last_seen_at: now,
        updated_count: 0,
      };

      const { data, error } = await client
        .from("blog_content")
        .insert(newRecord)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to save content: ${error.message}`);
      }

      return data as ContentRecord;
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

      const { data, error } = await client
        .from("blog_content")
        .update({
          fingerprint,
          title,
          last_seen_at: now,
          updated_count: client.rpc("increment_updated_count"),
        })
        .eq("url", url)
        .select()
        .single();

      if (error) {
        // Fallback if RPC doesn't exist
        const { data: fallbackData, error: fallbackError } = await client
          .from("blog_content")
          .select("updated_count")
          .eq("url", url)
          .single();

        if (fallbackError) {
          throw new Error(`Failed to update content: ${error.message}`);
        }

        const { data: updatedData, error: updateError } = await client
          .from("blog_content")
          .update({
            fingerprint,
            title,
            last_seen_at: now,
            updated_count:
              ((fallbackData as { updated_count: number })?.updated_count ||
                0) + 1,
          })
          .eq("url", url)
          .select()
          .single();

        if (updateError) {
          throw new Error(`Failed to update content: ${updateError.message}`);
        }

        return updatedData as ContentRecord;
      }

      return data as ContentRecord;
    },

    /**
     * Get watermark (last_processed_at) for a domain
     */
    async getWatermark(domain: string): Promise<WatermarkRecord | null> {
      const { data, error } = await client
        .from("blog_watermarks")
        .select("*")
        .eq("domain", domain)
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to get watermark: ${error.message}`);
      }

      return data as WatermarkRecord | null;
    },

    /**
     * Update watermark for a domain
     */
    async updateWatermark(domain: string): Promise<WatermarkRecord> {
      const now = new Date().toISOString();

      const { data, error } = await client
        .from("blog_watermarks")
        .upsert({ domain, last_processed_at: now }, { onConflict: "domain" })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update watermark: ${error.message}`);
      }

      return data as WatermarkRecord;
    },

    /**
     * Get all watermarks
     */
    async getAllWatermarks(): Promise<WatermarkRecord[]> {
      const { data, error } = await client
        .from("blog_watermarks")
        .select("*")
        .order("last_processed_at", { ascending: false });

      if (error) {
        throw new Error(`Failed to get watermarks: ${error.message}`);
      }

      return (data || []) as WatermarkRecord[];
    },

    /**
     * Get content records by domain
     */
    async getContentByDomain(
      domain: string,
      limit = 100,
    ): Promise<ContentRecord[]> {
      const { data, error } = await client
        .from("blog_content")
        .select("*")
        .eq("domain", domain)
        .order("last_seen_at", { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(`Failed to get content: ${error.message}`);
      }

      return (data || []) as ContentRecord[];
    },
  };
}

export type SupabaseStorage = ReturnType<typeof createSupabaseStorage>;
