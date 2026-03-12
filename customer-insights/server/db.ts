/**
 * Database Layer (DuckDB in-memory)
 *
 * Initializes an in-memory DuckDB instance and creates views/tables from CSV
 * files stored in server/data/. CSVs are uploaded at runtime via the upload_csv
 * tool, which saves them to data/ and calls reloadView() to refresh DuckDB
 * views without restarting the server.
 *
 * Views:
 * - v_billing: Financial data with BRL currency parsing + customer name/email
 * - usage_stats: CDN/usage placeholder table
 *
 * Data directory: server/data/ (created automatically on first upload)
 */

import duckdb from "duckdb";
import path from "path";
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "fs";

// Resolve the data directory relative to this file, converting backslashes to
// forward slashes so DuckDB (which doesn't accept Windows paths) can use it.
const DATA_DIR = path.resolve(import.meta.dirname, "data").replace(/\\/g, "/");

// A single in-memory DuckDB instance shared across the whole server process.
// Using ":memory:" means the data lives only in RAM — fast, but no persistence
// across restarts. CSVs on disk serve as the durable source of truth.
const db = new duckdb.Database(":memory:");
const conn = db.connect();

// Wraps conn.run() in a Promise so we can use async/await throughout.
// Logs the full SQL on failure to make debugging easier.
function run(sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    conn.run(sql, (err: Error | null) => {
      if (err) {
        console.error(
          `[DB Error] SQL execution failed: ${err.message}\nQuery: ${sql}`,
        );
        reject(err);
      } else resolve();
    });
  });
}

// Wraps conn.all() to return rows as a typed array.
// Tools use this for SELECT queries that need to read results back.
export function query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    conn.all(sql, (err: Error | null, rows: unknown) => {
      if (err) {
        console.error(
          `[DB Error] SQL query failed: ${err.message}\nQuery: ${sql}`,
        );
        reject(err);
      } else resolve(rows as T[]);
    });
  });
}

async function createBillingView(csvPath: string): Promise<void> {
  await run(`
    CREATE OR REPLACE VIEW v_billing AS
    SELECT DISTINCT
      -- Cast the numeric string ID to INTEGER for reliable joins and comparisons
      TRY_CAST("ID" AS INTEGER) AS id,

      -- Customer info (previously in separate contacts table)
      "Cliente" AS name,
      "Email contato deco.cx (from Cliente)" AS email,

      -- Date parsing: Vencimento is a formula field and always arrives as D/M/YYYY
      -- (e.g. "29/9/2023"). Reference month and paid_date arrive as ISO (YYYY-MM-DD)
      -- from the old API but will switch to D/M/YYYY after cellFormat=string syncs.
      -- COALESCE tries Brazilian format first, falls back to ISO — handles both gracefully.
      COALESCE(
        TRY_STRPTIME("Vencimento",      '%d/%m/%Y'),
        TRY_STRPTIME("Vencimento",      '%Y-%m-%d')
      )::DATE AS due_date,

      -- BRL currency cleanup: strip "R$", thousands dots, then swap decimal comma for dot
      -- e.g. "R$ 1.234,56" → strip R/$/. → "1234,56" → swap comma → "1234.56" → 1234.56
      -- Uses chained REPLACE instead of REGEXP_REPLACE to avoid DuckDB 1.x regex edge cases
      -- with '$' inside character classes.
      TRY_CAST(
        REPLACE(
          REPLACE(
            REPLACE(REPLACE(REPLACE("Valor", 'R', ''), '$', ''), '.', ''),
          ',', '.')
        , ' ', '')
      AS DOUBLE) AS amount,

      COALESCE(
        TRY_STRPTIME("Reference month", '%d/%m/%Y'),
        TRY_STRPTIME("Reference month", '%Y-%m-%d')
      )::DATE AS reference_month,
      "Status Account" AS status,
      COALESCE(
        TRY_STRPTIME("paid_date",       '%d/%m/%Y'),
        TRY_STRPTIME("paid_date",       '%Y-%m-%d')
      )::DATE AS paid_date,

      -- Usage metrics: values use Brazilian number format where '.' is the
      -- thousands separator (e.g. '8.751.415' = 8,751,415). Strip dots before
      -- casting so '8.751.415' → '8751415' → 8751415 as BIGINT.
      TRY_CAST(REPLACE("Pageviews considered", '.', '') AS BIGINT) AS pageviews,
      TRY_CAST(REPLACE("Requests considered",  '.', '') AS BIGINT) AS requests,

      -- Bandwidth also uses Brazilian format but with a decimal comma on top of
      -- the thousands dot (e.g. '1.461,8' = 1461.8 GB).
      -- Step 1: strip thousands dots → '1461,8'
      -- Step 2: swap decimal comma for dot → '1461.8' → 1461.8 as DOUBLE
      TRY_CAST(
        REPLACE(REPLACE("BW considered", '.', ''), ',', '.')
      AS DOUBLE) AS bandwidth,

      "Plan (from Subscription)" AS plan,

      -- Efficiency ratios — TRY_CAST returns NULL instead of throwing if the
      -- value is missing or unparseable, keeping the view robust
      TRY_CAST("Request pageview Ratio" AS DOUBLE) AS request_pageview_ratio,
      TRY_CAST("BW/10kPageview ratio" AS DOUBLE) AS bw_per_10k_pageview,

      -- Overage costs — same BRL stripping as amount above
      TRY_CAST(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE("Extrapageviews price", 'R', ''), '$', ''), '.', ''), ',', '.'), ' ', '') AS DOUBLE) AS extra_pageviews_price,
      TRY_CAST(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE("Extra Req price", 'R', ''), '$', ''), '.', ''), ',', '.'), ' ', '') AS DOUBLE) AS extra_req_price,
      TRY_CAST(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE("ExtraBW price", 'R', ''), '$', ''), '.', ''), ',', '.'), ' ', '') AS DOUBLE) AS extra_bw_price,

      TRY_CAST("Number of Seats Builders" AS INTEGER) AS seats_builders,
      TRY_CAST(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE("Seats Builder Total Cost", 'R', ''), '$', ''), '.', ''), ',', '.'), ' ', '') AS DOUBLE) AS seats_builder_cost,
      TRY_CAST(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE("Support Price", 'R', ''), '$', ''), '.', ''), ',', '.'), ' ', '') AS DOUBLE) AS support_price,

      -- Pre-calculated tier simulation costs stored in the CSV.
      -- Tiering values use point as decimal separator (e.g. "R$2783.28"), so we
      -- only strip R, $, and spaces — the dot is the actual decimal separator here.
      TRY_CAST(REPLACE(REPLACE(REPLACE("standard 40 reais a cada 10k pageviews + extras", 'R', ''), '$', ''), ' ', '') AS DOUBLE) AS tier_40_cost,
      TRY_CAST(REPLACE(REPLACE(REPLACE("standard 50 reais a cada 10k pageviews + extra", 'R', ''), '$', ''), ' ', '') AS DOUBLE) AS tier_50_cost,
      TRY_CAST(REPLACE(REPLACE(REPLACE("standard 80 reais a cada 10k pageviews + extra", 'R', ''), '$', ''), ' ', '') AS DOUBLE) AS tier_80_cost
    FROM read_csv_auto('${csvPath}', all_varchar=true)
  `);
}

// Empty fallback view keeps tools from crashing when no CSV has been loaded yet.
// Returns zero rows but exposes the right column schema so queries compile.
async function createEmptyBillingView(): Promise<void> {
  // All columns must match createBillingView exactly so queries compile against
  // this fallback without errors when no CSV has been loaded yet.
  await run(`
    CREATE OR REPLACE VIEW v_billing AS
    SELECT
      NULL::INTEGER   AS id,
      NULL::VARCHAR   AS name,
      NULL::VARCHAR   AS email,
      NULL::DATE      AS due_date,
      NULL::DOUBLE    AS amount,
      NULL::DATE      AS reference_month,
      NULL::VARCHAR   AS status,
      NULL::DATE      AS paid_date,
      NULL::BIGINT    AS pageviews,
      NULL::BIGINT    AS requests,
      NULL::DOUBLE    AS bandwidth,
      NULL::VARCHAR   AS plan,
      NULL::DOUBLE    AS request_pageview_ratio,
      NULL::DOUBLE    AS bw_per_10k_pageview,
      NULL::DOUBLE    AS extra_pageviews_price,
      NULL::DOUBLE    AS extra_req_price,
      NULL::DOUBLE    AS extra_bw_price,
      NULL::INTEGER   AS seats_builders,
      NULL::DOUBLE    AS seats_builder_cost,
      NULL::DOUBLE    AS support_price,
      NULL::DOUBLE    AS tier_40_cost,
      NULL::DOUBLE    AS tier_50_cost,
      NULL::DOUBLE    AS tier_80_cost
    WHERE false
  `);
}

export function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

// Persists a CSV string to disk so it survives across view reloads.
// The in-memory DuckDB view points to this file path.
export function saveCsv(fileName: string, content: string): string {
  ensureDataDir();
  const filePath = `${DATA_DIR}/${fileName}`;
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

// Hot-reloads the billing view from the CSV file on disk without restarting
// the server. Called after upload_csv or airtable_sync writes a new file.
export async function reloadView(): Promise<number> {
  const csvPath = `${DATA_DIR}/billing.csv`;

  if (!existsSync(csvPath)) {
    throw new Error(
      `CSV not found: ${csvPath}. Use upload_csv or airtable_sync to load data first.`,
    );
  }

  await createBillingView(csvPath);
  const [row] = await query<{ total: number }>(
    "SELECT count(*) AS total FROM v_billing",
  );
  const total = Number(row.total);
  console.log(`[DB] v_billing reloaded from ${csvPath} — ${total} rows`);
  return total;
}

// Attempts to load the billing CSV at startup. If the file doesn't exist or
// is corrupted, falls back to an empty view so the server still starts cleanly.
async function tryLoadBillingCsv(): Promise<string> {
  const csvPath = `${DATA_DIR}/billing.csv`;

  if (!existsSync(csvPath)) {
    console.warn(
      `[DB] No billing CSV found in ${DATA_DIR}. Use upload_csv or airtable_sync to load data.`,
    );
    await createEmptyBillingView();
    return "none";
  }

  try {
    await createBillingView(csvPath);
    return csvPath;
  } catch (err) {
    // If the CSV exists but can't be parsed (bad format, truncated file), delete
    // it and fall back to an empty view rather than leaving the server broken.
    console.warn(
      `[DB] Billing CSV is corrupted, deleting: ${(err as Error).message}`,
    );
    try {
      unlinkSync(csvPath);
    } catch {}
    await createEmptyBillingView();
    return "none";
  }
}

// The snapshots table stores pre-computed executive summaries keyed by customer_name.
// Using a real TABLE (not a view) so data persists across reloads within the same
// process. One row per customer — the primary key enforces that constraint.
export async function createSnapshotsTable(): Promise<void> {
  await run(`
    CREATE TABLE IF NOT EXISTS summary_snapshots (
      customer_name VARCHAR NOT NULL,
      generated_at TIMESTAMP NOT NULL DEFAULT now(),
      summary_text VARCHAR NOT NULL,
      data_sources VARCHAR NOT NULL,
      meta VARCHAR NOT NULL,
      PRIMARY KEY (customer_name)
    )
  `);
}

// Upsert pattern: delete the existing snapshot first, then insert the new one.
// DuckDB doesn't support ON CONFLICT DO UPDATE, so we do it in two steps.
// Single quotes inside JSON/text are escaped by doubling them ('').
export async function saveSnapshot(
  customerName: string,
  summaryText: string,
  dataSources: Record<string, unknown>,
  meta: Record<string, unknown>,
): Promise<void> {
  const escapedName = customerName.replace(/'/g, "''");
  const escapedSummary = summaryText.replace(/'/g, "''");
  const escapedData = JSON.stringify(dataSources).replace(/'/g, "''");
  const escapedMeta = JSON.stringify(meta).replace(/'/g, "''");

  await run(`
    DELETE FROM summary_snapshots WHERE customer_name = '${escapedName}'
  `);
  await run(`
    INSERT INTO summary_snapshots (customer_name, generated_at, summary_text, data_sources, meta)
    VALUES ('${escapedName}', now(), '${escapedSummary}', '${escapedData}', '${escapedMeta}')
  `);
  console.log(`[DB] Snapshot saved for customer ${customerName}`);
}

export async function getSnapshot(customerName: string): Promise<{
  customer_name: string;
  generated_at: string;
  summary_text: string;
  data_sources: string;
  meta: string;
} | null> {
  const escapedName = customerName.replace(/'/g, "''");
  const rows = await query<{
    customer_name: string;
    generated_at: string;
    summary_text: string;
    data_sources: string;
    meta: string;
  }>(
    // Cast generated_at to VARCHAR so it arrives as an ISO string, not a
    // DuckDB Timestamp object that would need extra handling on the JS side.
    `SELECT customer_name, generated_at::VARCHAR AS generated_at, summary_text, data_sources, meta
     FROM summary_snapshots
     WHERE customer_name = '${escapedName}'
     LIMIT 1`,
  );
  if (!rows.length) return null;
  return rows[0];
}

export async function listSnapshots(): Promise<
  Array<{
    customer_name: string;
    generated_at: string;
  }>
> {
  return query<{ customer_name: string; generated_at: string }>(
    `SELECT customer_name, generated_at::VARCHAR AS generated_at
     FROM summary_snapshots
     ORDER BY generated_at DESC`,
  );
}

// Entry point called once when the server starts.
// usage_stats is kept as a placeholder for future CDN data integration.
export async function initDb(): Promise<void> {
  console.log("[DB] Initializing financial data layer...");
  ensureDataDir();

  const billingCsv = await tryLoadBillingCsv();
  console.log(`[DB] Billing CSV: ${billingCsv}`);

  // usage_stats holds CDN-level metrics (requests, bandwidth, pageviews per site).
  // Currently populated externally — not yet wired to any upload tool.
  await run(`
    CREATE TABLE IF NOT EXISTS usage_stats (
      date DATE,
      site_name VARCHAR,
      cdn_requests BIGINT,
      cdn_bandwidth_bytes BIGINT,
      pageviews BIGINT,
      unique_visitors BIGINT,
      cdn_errors_total BIGINT
    )
  `);

  await createSnapshotsTable();
  console.log("[DB] Summary snapshots table ready.");

  console.log("[DB] Data layer ready. Analytics engine operational.");
}
