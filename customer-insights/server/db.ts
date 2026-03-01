/**
 * Database Layer (DuckDB in-memory)
 *
 * Initializes an in-memory DuckDB instance and creates views/tables from CSV
 * files stored in server/data/. CSVs are uploaded at runtime via the upload_csv
 * tool, which saves them to data/ and calls reloadView() to refresh DuckDB
 * views without restarting the server.
 *
 * Views:
 * - v_billing: Financial data with BRL currency parsing
 * - v_customer_contacts: Customer contact info (id, name, email)
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
        console.error(`[DB Error] SQL execution failed: ${err.message}\nQuery: ${sql}`);
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
        console.error(`[DB Error] SQL query failed: ${err.message}\nQuery: ${sql}`);
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
      "ID"::INTEGER AS id,
      "Vencimento"::DATE AS due_date,

      -- BRL currency cleanup: strip "R$", thousands dots, then swap decimal comma for dot
      -- e.g. "R$ 1.234,56" → "123456" → "1234.56" → 1234.56
      CAST(
        REPLACE(
          REPLACE(
            REGEXP_REPLACE("Valor", '[R$.]', '', 'g'),
          ',', '.')
        , ' ', '')
      AS DOUBLE) AS amount,

      "Reference month"::DATE AS reference_month,
      "Status Account" AS status,
      "paid_date"::DATE AS paid_date,

      -- Usage metrics from the billing period
      "Pageviews considered"::BIGINT AS pageviews,
      "Requests considered"::BIGINT AS requests,

      -- Bandwidth uses comma as decimal separator in the CSV
      CAST(
        REPLACE("BW considered", ',', '.')
      AS DOUBLE) AS bandwidth,

      "Plan (from Subscription)" AS plan,

      -- Efficiency ratios — TRY_CAST returns NULL instead of throwing if the
      -- value is missing or unparseable, keeping the view robust
      TRY_CAST("Request pageview Ratio" AS DOUBLE) AS request_pageview_ratio,
      TRY_CAST("BW/10kPageview ratio" AS DOUBLE) AS bw_per_10k_pageview,

      -- Overage costs — same BRL parsing pattern as "Valor" above
      TRY_CAST(REPLACE(REPLACE(REGEXP_REPLACE("Extrapageviews price", '[R$.]', '', 'g'), ',', '.'), ' ', '') AS DOUBLE) AS extra_pageviews_price,
      TRY_CAST(REPLACE(REPLACE(REGEXP_REPLACE("Extra Req price", '[R$.]', '', 'g'), ',', '.'), ' ', '') AS DOUBLE) AS extra_req_price,
      TRY_CAST(REPLACE(REPLACE(REGEXP_REPLACE("ExtraBW price", '[R$.]', '', 'g'), ',', '.'), ' ', '') AS DOUBLE) AS extra_bw_price,

      TRY_CAST("Number of Seats Builders" AS INTEGER) AS seats_builders,
      TRY_CAST(REPLACE(REPLACE(REGEXP_REPLACE("Seats Builder Total Cost", '[R$.]', '', 'g'), ',', '.'), ' ', '') AS DOUBLE) AS seats_builder_cost,
      TRY_CAST(REPLACE(REPLACE(REGEXP_REPLACE("Support Price", '[R$.]', '', 'g'), ',', '.'), ' ', '') AS DOUBLE) AS support_price,

      -- Pre-calculated tier simulation costs stored in the CSV.
      -- These represent what the customer would pay under each pricing tier,
      -- and are used by customer_tiering_optimizer to suggest plan changes.
      TRY_CAST(REGEXP_REPLACE("standard 40 reais a cada 10k pageviews + extras", '[R$ ]', '', 'g') AS DOUBLE) AS tier_40_cost,
      TRY_CAST(REGEXP_REPLACE("standard 50 reais a cada 10k pageviews + extra", '[R$ ]', '', 'g') AS DOUBLE) AS tier_50_cost,
      TRY_CAST(REGEXP_REPLACE("standard 80 reais a cada 10k pageviews + extra", '[R$ ]', '', 'g') AS DOUBLE) AS tier_80_cost
    FROM read_csv_auto('${csvPath}')
  `);
}

async function createContactsView(csvPath: string): Promise<void> {
  // Minimal projection — only the three fields tools actually need.
  // Extra columns in the Airtable/CSV export are silently ignored here.
  await run(`
    CREATE OR REPLACE VIEW v_customer_contacts AS
    SELECT DISTINCT
      "ID"::INTEGER AS id,
      "Nome" AS name,
      "Email" AS email
    FROM read_csv_auto('${csvPath}')
  `);
}

// Empty fallback views keep tools from crashing when no CSV has been loaded yet.
// They return zero rows but expose the right column schema so queries compile.
async function createEmptyBillingView(): Promise<void> {
  await run(`CREATE OR REPLACE VIEW v_billing AS SELECT NULL::INTEGER AS id WHERE false`);
}

async function createEmptyContactsView(): Promise<void> {
  await run(`CREATE OR REPLACE VIEW v_customer_contacts AS SELECT NULL::INTEGER AS id, NULL::VARCHAR AS name, NULL::VARCHAR AS email WHERE false`);
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

// Hot-reloads a DuckDB view from the CSV file on disk without restarting
// the server. Called after upload_csv or airtable_sync writes a new file.
export async function reloadView(viewName: "billing" | "contacts"): Promise<number> {
  const fileName = viewName === "billing" ? "billing.csv" : "contacts.csv";
  const csvPath = `${DATA_DIR}/${fileName}`;

  if (!existsSync(csvPath)) {
    throw new Error(`CSV not found: ${csvPath}. Use upload_csv to upload data first.`);
  }

  if (viewName === "billing") {
    await createBillingView(csvPath);
    const [row] = await query<{ total: number }>("SELECT count(*) AS total FROM v_billing");
    const total = Number(row.total);
    console.log(`[DB] v_billing reloaded from ${csvPath} — ${total} rows`);
    return total;
  }

  await createContactsView(csvPath);
  const [row] = await query<{ total: number }>("SELECT count(*) AS total FROM v_customer_contacts");
  const total = Number(row.total);
  console.log(`[DB] v_customer_contacts reloaded from ${csvPath} — ${total} rows`);
  return total;
}

// Attempts to load a CSV into a view at startup. If the file doesn't exist or
// is corrupted, falls back to an empty view so the server still starts cleanly.
async function tryLoadCsv(
  viewType: "billing" | "contacts",
  createFn: (csvPath: string) => Promise<void>,
  createEmptyFn: () => Promise<void>,
): Promise<string> {
  const fileName = viewType === "billing" ? "billing.csv" : "contacts.csv";
  const csvPath = `${DATA_DIR}/${fileName}`;

  if (!existsSync(csvPath)) {
    console.warn(`[DB] No ${viewType} CSV found in ${DATA_DIR}. Use upload_csv to load data.`);
    await createEmptyFn();
    return "none";
  }

  try {
    await createFn(csvPath);
    return csvPath;
  } catch (err) {
    // If the CSV exists but can't be parsed (bad format, truncated file), delete
    // it and fall back to an empty view rather than leaving the server broken.
    console.warn(`[DB] ${viewType} CSV is corrupted, deleting: ${(err as Error).message}`);
    try { unlinkSync(csvPath); } catch {}
    await createEmptyFn();
    return "none";
  }
}

// The snapshots table stores pre-computed executive summaries keyed by customer_id.
// Using a real TABLE (not a view) so data persists across reloads within the same
// process. One row per customer — the primary key enforces that constraint.
export async function createSnapshotsTable(): Promise<void> {
  await run(`
    CREATE TABLE IF NOT EXISTS summary_snapshots (
      customer_id INTEGER NOT NULL,
      generated_at TIMESTAMP NOT NULL DEFAULT now(),
      summary_text VARCHAR NOT NULL,
      data_sources VARCHAR NOT NULL,
      meta VARCHAR NOT NULL,
      PRIMARY KEY (customer_id)
    )
  `);
}

// Upsert pattern: delete the existing snapshot first, then insert the new one.
// DuckDB doesn't support ON CONFLICT DO UPDATE, so we do it in two steps.
// Single quotes inside JSON/text are escaped by doubling them ('').
export async function saveSnapshot(
  customerId: number,
  summaryText: string,
  dataSources: Record<string, unknown>,
  meta: Record<string, unknown>,
): Promise<void> {
  const escapedSummary = summaryText.replace(/'/g, "''");
  const escapedData = JSON.stringify(dataSources).replace(/'/g, "''");
  const escapedMeta = JSON.stringify(meta).replace(/'/g, "''");

  await run(`
    DELETE FROM summary_snapshots WHERE customer_id = ${customerId}
  `);
  await run(`
    INSERT INTO summary_snapshots (customer_id, generated_at, summary_text, data_sources, meta)
    VALUES (${customerId}, now(), '${escapedSummary}', '${escapedData}', '${escapedMeta}')
  `);
  console.log(`[DB] Snapshot saved for customer ${customerId}`);
}

export async function getSnapshot(customerId: number): Promise<{
  customer_id: number;
  generated_at: string;
  summary_text: string;
  data_sources: string;
  meta: string;
} | null> {
  const rows = await query<{
    customer_id: number;
    generated_at: unknown;
    summary_text: string;
    data_sources: string;
    meta: string;
  }>(
    // Cast generated_at to VARCHAR so it arrives as an ISO string, not a
    // DuckDB Timestamp object that would need extra handling on the JS side.
    `SELECT customer_id, generated_at::VARCHAR AS generated_at, summary_text, data_sources, meta
     FROM summary_snapshots
     WHERE customer_id = ${customerId}
     LIMIT 1`,
  );
  if (!rows.length) return null;
  return rows[0];
}

export async function listSnapshots(): Promise<Array<{
  customer_id: number;
  generated_at: string;
}>> {
  return query<{ customer_id: number; generated_at: string }>(
    `SELECT customer_id, generated_at::VARCHAR AS generated_at
     FROM summary_snapshots
     ORDER BY generated_at DESC`,
  );
}

// Entry point called once when the server starts.
// Order matters: billing loads first because other tools depend on it.
// usage_stats is kept as a placeholder for future CDN data integration.
export async function initDb(): Promise<void> {
  console.log("[DB] Initializing financial data layer...");
  ensureDataDir();

  const billingCsv = await tryLoadCsv("billing", createBillingView, createEmptyBillingView);
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

  const contactsCsv = await tryLoadCsv("contacts", createContactsView, createEmptyContactsView);
  console.log(`[DB] Contacts CSV: ${contactsCsv}`);

  await createSnapshotsTable();
  console.log("[DB] Summary snapshots table ready.");

  console.log("[DB] Data layer ready. Analytics engine operational.");
}
