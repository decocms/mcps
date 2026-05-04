/**
 * In-memory store for active Discord interactions.
 *
 * Discord interactions have a 15-minute lifetime — after auto-defer, the
 * agent calls DISCORD_INTERACTION_FOLLOWUP with the interaction_token.
 * We track each one here so we can:
 *   - Detect already_responded (idempotency for same-bot multi-connection
 *     fan-out — see plan §"Multi-tenant / mesma bot_token").
 *   - Sweep expired tokens.
 *
 * Note: Discord's webhook URLs are auth'd by interaction_token itself, so
 * any pod that has the token can answer — this store is defense-in-depth,
 * not a hard gate. We never block follow-ups from foreign pods; we only
 * use the local store for idempotency on this pod.
 */

const TOKEN_TTL_MS = 15 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

export interface InteractionRecord {
  interaction_id: string;
  token: string;
  application_id: string;
  type: number; // discord.js InteractionType
  expires_at: number;
  already_responded: boolean;
  custom_id?: string;
  channel_id?: string;
  guild_id?: string;
}

const store = new Map<string, InteractionRecord>();

export function set(
  record: Omit<InteractionRecord, "expires_at" | "already_responded">,
): void {
  store.set(record.interaction_id, {
    ...record,
    expires_at: Date.now() + TOKEN_TTL_MS,
    already_responded: false,
  });
}

export function get(interaction_id: string): InteractionRecord | undefined {
  return store.get(interaction_id);
}

/**
 * Mark a record as responded. Returns true on first call, false if it was
 * already marked — used by the FOLLOWUP/UPDATE tools for idempotency when
 * the same bot is connected via two Mesh connections.
 */
export function markResponded(interaction_id: string): boolean {
  const record = store.get(interaction_id);
  if (!record) return true; // Unknown id — let the call through; Discord will reject if expired.
  if (record.already_responded) return false;
  record.already_responded = true;
  return true;
}

export function size(): number {
  return store.size;
}

let sweepInterval: ReturnType<typeof setInterval> | null = null;

export function startSweeper(): void {
  if (sweepInterval) return;
  sweepInterval = setInterval(() => {
    const now = Date.now();
    for (const [id, record] of store) {
      if (record.expires_at < now) store.delete(id);
    }
  }, SWEEP_INTERVAL_MS);
}

export function stopSweeper(): void {
  if (sweepInterval) {
    clearInterval(sweepInterval);
    sweepInterval = null;
  }
}
