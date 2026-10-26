import { triggers } from "./store.ts";
import type { RecordingDetails, WebhookPayload } from "../lib/types.ts";

export function publishRecordingTrigger(
  connectionId: string,
  webhookType: "recording_added" | "recording_updated",
  details: RecordingDetails,
  payload: WebhookPayload,
): void {
  const triggerType =
    webhookType === "recording_added"
      ? "grain.recording.added"
      : "grain.recording.updated";

  triggers.notify(connectionId, triggerType, {
    recording_id: payload.data.id,
    title: details.title ?? null,
    url: details.url ?? null,
    start_datetime: details.start_datetime ?? null,
    end_datetime: details.end_datetime ?? null,
    owners: details.owners ?? [],
    tags: details.tags ?? [],
    participants: (details.participants ?? []).map((p) => ({
      name: p.name,
      email: p.email,
      scope: p.scope,
    })),
    has_summary: !!details.intelligence_notes_md,
    indexed_at: new Date().toISOString(),
  });
}
