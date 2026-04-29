/**
 * KV-backed mapping from Gmail email address to Mesh connection ID.
 *
 * Uses Cloudflare KV (EMAIL_MAP binding) for persistence across
 * Worker isolates and restarts.
 *
 * Stores two keys per mapping for O(1) lookup in both directions:
 *   email:<addr>  → connectionId
 *   conn:<connId> → email address
 */

const EMAIL_PREFIX = "email:";
const CONN_PREFIX = "conn:";

export async function setEmailMapping(
  kv: KVNamespace,
  email: string,
  connectionId: string,
): Promise<void> {
  const normalizedEmail = email.toLowerCase();
  await Promise.all([
    kv.put(`${EMAIL_PREFIX}${normalizedEmail}`, connectionId),
    kv.put(`${CONN_PREFIX}${connectionId}`, normalizedEmail),
  ]);
}

export async function getConnectionForEmail(
  kv: KVNamespace,
  email: string,
): Promise<string | undefined> {
  const value = await kv.get(`${EMAIL_PREFIX}${email.toLowerCase()}`);
  return value ?? undefined;
}

export async function removeConnectionMappings(
  kv: KVNamespace,
  connectionId: string,
): Promise<void> {
  const email = await kv.get(`${CONN_PREFIX}${connectionId}`);
  if (!email) return;
  await Promise.all([
    kv.delete(`${EMAIL_PREFIX}${email}`),
    kv.delete(`${CONN_PREFIX}${connectionId}`),
  ]);
}
