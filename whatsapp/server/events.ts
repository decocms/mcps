import { env } from "./env";

export async function publishEvent({
  data,
  organizationId,
  type,
  subject,
}: {
  type: string;
  data: unknown;
  organizationId: string;
  subject?: string;
}) {
  const meshUrl = env.MESH_URL;
  const url = new URL(
    `${meshUrl}/org/${organizationId}/events/${type}?subject=${subject}`,
  );
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Failed to publish event to mesh (${response.status}): ${errorText || response.statusText}`,
    );
  }
}
