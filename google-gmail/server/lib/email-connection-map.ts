/**
 * KV-backed mapping from Gmail email address to Mesh connection ID.
 *
 * Uses Cloudflare KV (EMAIL_MAP binding) for persistence across
 * Worker isolates and restarts.
 */

const KV_PREFIX = "email:";

export async function setEmailMapping(
  kv: KVNamespace,
  email: string,
  connectionId: string,
): Promise<void> {
  await kv.put(`${KV_PREFIX}${email.toLowerCase()}`, connectionId);
}

export async function getConnectionForEmail(
  kv: KVNamespace,
  email: string,
): Promise<string | undefined> {
  const value = await kv.get(`${KV_PREFIX}${email.toLowerCase()}`);
  return value ?? undefined;
}

export async function removeConnectionMappings(
  kv: KVNamespace,
  connectionId: string,
): Promise<void> {
  const listed = await kv.list({ prefix: KV_PREFIX });
  const deletes: Promise<void>[] = [];
  for (const key of listed.keys) {
    const value = await kv.get(key.name);
    if (value === connectionId) {
      deletes.push(kv.delete(key.name));
    }
  }
  await Promise.all(deletes);
}
