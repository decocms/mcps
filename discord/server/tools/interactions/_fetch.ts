/**
 * Shared fetch wrapper for the Discord interaction REST endpoints.
 * Used by FOLLOWUP, UPDATE, and SHOW_MODAL tools.
 *
 * Webhook URLs (`/webhooks/{app_id}/{token}/...`) are auth'd by the
 * interaction token itself — no bot token needed.
 */

interface FetchInteractionResult {
  success: boolean;
  message: string;
  message_id?: string;
  response_text?: string;
  status?: number;
}

export async function fetchInteractionAPI(
  url: string,
  method: "POST" | "PATCH",
  body: Record<string, unknown>,
): Promise<FetchInteractionResult> {
  try {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        message: `Discord API ${response.status}: ${text}`,
        response_text: text,
        status: response.status,
      };
    }

    // Some endpoints return 204; others return the message JSON.
    if (response.status === 204) {
      return { success: true, message: "OK" };
    }

    const data = (await response.json()) as { id?: string };
    return {
      success: true,
      message: "OK",
      message_id: data.id,
    };
  } catch (err) {
    return {
      success: false,
      message: `Network error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
