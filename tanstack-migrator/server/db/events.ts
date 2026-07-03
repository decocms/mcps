/** CRUD for sitemig_events — dashboard activity feed. Best-effort writes. */

import { getSupabaseClient, requireSupabase } from "./client.ts";
import type { EventRow } from "./types.ts";

export async function addEvent(
  siteId: string | null,
  message: string,
  level: "info" | "warn" | "error" = "info",
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    await client
      .from("sitemig_events")
      .insert({ site_id: siteId, level, message });
  } catch {
    // feed is best-effort; never fail a phase because of it
  }
}

export async function listEventsForSite(
  siteId: string,
  limit = 50,
): Promise<EventRow[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("sitemig_events")
    .select("*")
    .eq("site_id", siteId)
    .order("id", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to list events: ${error.message}`);
  return (data as EventRow[]) ?? [];
}
