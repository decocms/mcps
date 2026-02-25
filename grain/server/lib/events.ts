export interface GrainIndexedEventPayload {
  recordingId: string;
  title: string;
  indexedAt: string;
}

export function extractMeshUrl(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }
  if (!("MESH_REQUEST_CONTEXT" in input)) {
    return undefined;
  }

  const context = input.MESH_REQUEST_CONTEXT;
  if (typeof context !== "object" || context === null) {
    return undefined;
  }
  if (!("meshUrl" in context)) {
    return undefined;
  }

  return typeof context.meshUrl === "string" ? context.meshUrl : undefined;
}

export async function publishMeshEvent(
  meshUrl: string | undefined,
  eventType: string,
  payload: GrainIndexedEventPayload,
): Promise<void> {
  if (!meshUrl) {
    return;
  }

  const url = `${meshUrl}/events/${eventType}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Failed to publish event (${response.status}): ${errorText || response.statusText}`,
    );
  }
}
