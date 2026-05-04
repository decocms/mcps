/**
 * KV-backed mapping from Gmail email address to Mesh connection ID.
 *
 * Backed by Workers KV (EMAIL_MAP binding) for persistence across
 * Worker isolates and restarts. Stores two keys per mapping for O(1)
 * lookup in both directions:
 *   email:<addr>  → connectionId
 *   conn:<connId> → email address (reverse index, used for cleanup)
 */

interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

const EMAIL_PREFIX = "email:";
const CONN_PREFIX = "conn:";

export async function setEmailMapping(
  kv: KVNamespaceLike,
  email: string,
  connectionId: string,
): Promise<void> {
  const normalizedEmail = email.toLowerCase();
  // Read the previous owner of this email so we can tear down its
  // reverse-index entry — otherwise a later removeConnectionMappings
  // for the old connection would wipe the forward mapping we just wrote.
  const previousOwner = await kv.get(`${EMAIL_PREFIX}${normalizedEmail}`);
  const ops: Promise<void>[] = [
    kv.put(`${EMAIL_PREFIX}${normalizedEmail}`, connectionId),
    kv.put(`${CONN_PREFIX}${connectionId}`, normalizedEmail),
  ];
  if (previousOwner && previousOwner !== connectionId) {
    ops.push(kv.delete(`${CONN_PREFIX}${previousOwner}`));
  }
  await Promise.all(ops);
}

export async function getConnectionForEmail(
  kv: KVNamespaceLike,
  email: string,
): Promise<string | undefined> {
  const value = await kv.get(`${EMAIL_PREFIX}${email.toLowerCase()}`);
  return value ?? undefined;
}

export async function getEmailForConnection(
  kv: KVNamespaceLike,
  connectionId: string,
): Promise<string | undefined> {
  const value = await kv.get(`${CONN_PREFIX}${connectionId}`);
  return value ?? undefined;
}

export async function removeConnectionMappings(
  kv: KVNamespaceLike,
  connectionId: string,
): Promise<void> {
  const email = await kv.get(`${CONN_PREFIX}${connectionId}`);
  if (!email) return;
  await Promise.all([
    kv.delete(`${EMAIL_PREFIX}${email}`),
    kv.delete(`${CONN_PREFIX}${connectionId}`),
  ]);
}
