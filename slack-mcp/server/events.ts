/**
 * Event Bus Integration for Slack MCP
 *
 * Publishes events to and subscribes from the Deco Mesh Event Bus.
 */

export interface EventPublishOptions {
  meshUrl?: string;
  organizationId?: string;
}

export interface CloudEvent {
  type: string;
  data: unknown;
  subject?: string;
  source?: string;
  id?: string;
  time?: string;
}

/**
 * Publish an event to the Mesh Event Bus
 */
export async function publishEvent(
  event: CloudEvent,
  options: EventPublishOptions,
): Promise<void> {
  const { meshUrl, organizationId } = options;

  if (!meshUrl || !organizationId) {
    console.error("[Events] Missing meshUrl or organizationId for publishing");
    return;
  }

  const url = new URL(`${meshUrl}/org/${organizationId}/events/${event.type}`);

  if (event.subject) {
    url.searchParams.set("subject", event.subject);
  }

  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event.data),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `Failed to publish event (${response.status}): ${errorText || response.statusText}`,
      );
    }

    console.log(`[Events] Published event: ${event.type}`, {
      subject: event.subject,
    });
  } catch (error) {
    console.error("[Events] Failed to publish event:", error);
    throw error;
  }
}

/**
 * Create a CloudEvent structure
 */
export function createCloudEvent(
  type: string,
  data: unknown,
  options: {
    subject?: string;
    source?: string;
  } = {},
): CloudEvent {
  return {
    type,
    data,
    subject: options.subject,
    source: options.source ?? "slack-mcp",
    id: crypto.randomUUID(),
    time: new Date().toISOString(),
  };
}
