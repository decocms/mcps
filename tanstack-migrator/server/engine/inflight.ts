/**
 * In-process tracker for long-running sandbox sessions (migrate passes,
 * parity iterations). The tick loop must never block on them: phases launch
 * the work here and return; the promise updates the DB when it settles.
 *
 * Restart semantics: this map dies with the pod. Sites left with
 * sandbox_session_id set and a stale last_progress_at are recovered by the
 * watchdog (cleared + retried) — sessions themselves are bounded, so the
 * worst case is redoing one iteration.
 */

export interface InflightEntry {
  kind: string;
  startedAt: number;
}

export class InflightTracker {
  private entries = new Map<string, InflightEntry>();

  has(siteId: string): boolean {
    return this.entries.has(siteId);
  }

  get(siteId: string): InflightEntry | undefined {
    return this.entries.get(siteId);
  }

  size(): number {
    return this.entries.size;
  }

  /**
   * Launch fire-and-forget work for a site. `fn` is responsible for all DB
   * updates; failures must be handled inside it (this catch is a last resort).
   */
  start(siteId: string, kind: string, fn: () => Promise<void>): void {
    if (this.entries.has(siteId)) return;
    this.entries.set(siteId, { kind, startedAt: Date.now() });
    fn()
      .catch((err) => {
        console.error(
          `[inflight] unhandled error in ${kind} for site ${siteId}:`,
          err instanceof Error ? err.message : err,
        );
      })
      .finally(() => {
        this.entries.delete(siteId);
      });
  }
}
