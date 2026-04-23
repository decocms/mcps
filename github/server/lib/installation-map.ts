/**
 * Installation → Connection ID mapping store.
 *
 * Backed by Workers KV when available (durable across isolates), with an
 * in-memory Map fallback for local dev. The KV binding is injected per-request
 * from env.INSTALLATIONS.
 */

interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; cursor?: string }): Promise<{
    keys: Array<{ name: string }>;
    list_complete: boolean;
    cursor?: string;
  }>;
}

export interface InstallationStore {
  get(installationId: number): Promise<string | undefined>;
  set(installationId: number, connectionId: string): Promise<void>;
  removeByConnection(connectionId: string): Promise<void>;
}

class MemoryInstallationStore implements InstallationStore {
  private map = new Map<number, string>();

  async get(installationId: number): Promise<string | undefined> {
    return this.map.get(installationId);
  }

  async set(installationId: number, connectionId: string): Promise<void> {
    this.map.set(installationId, connectionId);
  }

  async removeByConnection(connectionId: string): Promise<void> {
    for (const [id, conn] of this.map) {
      if (conn === connectionId) {
        this.map.delete(id);
      }
    }
  }
}

class KvInstallationStore implements InstallationStore {
  // KV keys:
  //   `installation:${installationId}` → connectionId
  //   `connection:${connectionId}:${installationId}` → "1" (reverse index)
  constructor(private kv: KVNamespaceLike) {}

  async get(installationId: number): Promise<string | undefined> {
    const v = await this.kv.get(`installation:${installationId}`);
    return v ?? undefined;
  }

  async set(installationId: number, connectionId: string): Promise<void> {
    // Read the existing owner first so we can tear down its reverse-index
    // entry — otherwise a later removeByConnection(oldOwner) would match
    // the stale connection:${oldOwner}:${id} key and wipe the forward
    // mapping we're about to write for the new owner.
    const existing = await this.kv.get(`installation:${installationId}`);
    const ops: Promise<void>[] = [
      this.kv.put(`installation:${installationId}`, connectionId),
      this.kv.put(`connection:${connectionId}:${installationId}`, "1"),
    ];
    if (existing && existing !== connectionId) {
      ops.push(this.kv.delete(`connection:${existing}:${installationId}`));
    }
    await Promise.all(ops);
  }

  async removeByConnection(connectionId: string): Promise<void> {
    const prefix = `connection:${connectionId}:`;
    let cursor: string | undefined;
    do {
      const {
        keys,
        list_complete,
        cursor: nextCursor,
      } = await this.kv.list({ prefix, cursor });
      await Promise.all(
        keys.flatMap((k) => {
          const installationId = k.name.slice(prefix.length);
          return [
            this.kv.delete(`installation:${installationId}`),
            this.kv.delete(k.name),
          ];
        }),
      );
      cursor = list_complete ? undefined : nextCursor;
    } while (cursor);
  }
}

const memoryStore = new MemoryInstallationStore();

export function getInstallationStore(
  kv: KVNamespaceLike | undefined,
): InstallationStore {
  return kv ? new KvInstallationStore(kv) : memoryStore;
}

/**
 * Fetch the user's GitHub App installations and persist mappings.
 * Swaps mappings atomically after successful fetch of all pages.
 */
export async function captureInstallationMappings(
  token: string,
  connectionId: string,
  store: InstallationStore,
): Promise<void> {
  try {
    const allInstallations: Array<{ id: number; account: { login: string } }> =
      [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const response = await fetch(
        `https://api.github.com/user/installations?per_page=${perPage}&page=${page}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch installations (page ${page}): ${response.status}`,
        );
      }

      const data = (await response.json()) as {
        installations: Array<{ id: number; account: { login: string } }>;
        total_count: number;
      };

      allInstallations.push(...data.installations);

      if (data.installations.length < perPage) break;
      page++;
    }

    await store.removeByConnection(connectionId);

    for (const installation of allInstallations) {
      await store.set(installation.id, connectionId);
      console.log(
        `[Installation] Mapped ${installation.id} (${installation.account.login}) → ${connectionId}`,
      );
    }
  } catch (error) {
    console.error("[Installation] Failed to capture mappings:", error);
  }
}
