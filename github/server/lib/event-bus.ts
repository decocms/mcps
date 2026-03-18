/**
 * Event Bus reference cache.
 *
 * Captured during onChange (when the runtime has full state),
 * so the webhook handler can publish events without going through
 * the authenticated runtime path.
 */

type EventPublishFn = (event: {
  type: string;
  subject: string;
  data?: Record<string, unknown>;
}) => Promise<unknown>;

let cachedPublish: EventPublishFn | null = null;

export function setEventPublisher(publish: EventPublishFn): void {
  cachedPublish = publish;
}

export function clearEventPublisher(): void {
  cachedPublish = null;
}

export async function publishEvent(event: {
  type: string;
  subject: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  if (!cachedPublish) {
    console.warn(
      "[EventBus] No publisher available — EVENT_BUS not yet configured",
    );
    return;
  }

  await cachedPublish(event);
}
