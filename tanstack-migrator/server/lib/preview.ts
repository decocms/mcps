/**
 * Preview readiness — the single source of truth for "does the migrated site
 * actually render?". Used by the worker's async probe (to flip preview_ready
 * for the UI) AND by the parity gate (to refuse measuring against a broken
 * candidate). Kept in its own module so phase handlers can import it without
 * pulling in the whole worker (which would be a circular import).
 */

/**
 * Preview only counts as ready when the site RENDERS real HTML — not when the
 * sandbox proxy answers with its "No web page at this URL" placeholder, and not
 * when the dev server returns an empty SSR shell (`<div id="root"></div>` with
 * no content). Both are served with HTTP 200 + text/html, so a status check
 * gives a false positive. We judge the BODY's rendered content, ignoring size:
 * visible text, or a real element tree (an empty shell has neither).
 */
export function looksLikeRealSite(html: string): boolean {
  if (/No web page/i.test(html)) return false; // sandbox proxy placeholder
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
  // strip non-content nodes so head/scripts/styles don't inflate the signal
  const content = body
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<template[\s\S]*?<\/template>/gi, "")
    // <noscript> is a static fallback ("enable JavaScript"), not rendered SSR —
    // its text would otherwise pass the visible-text signal on a broken shell
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  // visible rendered text is the strongest signal — a storefront always has it
  const text = content
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length > 40) return true;
  // no visible text: accept only a real element tree, not an empty root shell.
  // `<div id="root"></div>` is 1 element; a rendered page has many.
  const elements = content.match(/<[a-z][a-z0-9]*[\s/>]/gi)?.length ?? 0;
  return elements >= 8;
}

/**
 * Live check: does the preview URL serve real rendered HTML right now?
 * Returns false on any failure (down, non-HTML, placeholder, empty shell) so
 * callers can treat "unknown" the same as "not ready" — never gate a phase
 * forward on an uncertain preview.
 */
export async function previewRendersRealHtml(
  url: string,
  timeoutMs = 6_000,
): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status >= 500) return false;
    const ct = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!ct.includes("text/html")) return false;
    const html = await response.text();
    return looksLikeRealSite(html);
  } catch {
    return false;
  }
}
