/**
 * Tool: UPLOAD_CSV (upload_csv)
 *
 * Downloads a CSV from a public URL, saves it to the data/ directory, and
 * reloads the corresponding DuckDB view in real-time. Supports two data
 * types: "billing" (financial invoices) and "contacts" (customer info).
 * This allows updating the data source without restarting the server.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { saveCsv, reloadView } from "../db.ts";

export const createUploadCsvTool = (_env: Env) =>
  createPrivateTool({
    id: "upload_csv",
    description:
      "Downloads a CSV from a URL and updates the data source. " +
      "Google Drive view/share links are automatically converted to direct download — " +
      "just paste the link as-is, no conversion needed. Also supports S3 presigned URLs " +
      "and any direct CSV link. The DuckDB view reloads automatically.",

    inputSchema: z.object({
      data_type: z
        .enum(["billing", "contacts"])
        .describe(
          "Which dataset to update. 'billing' = invoice/financial data, 'contacts' = customer names and emails.",
        ),
      csv_url: z
        .string()
        .describe(
          "Public URL to the CSV file. Google Drive links (view, share, or download) are auto-converted — " +
          "paste any drive.google.com/file/d/... link directly. Also supports direct .csv URLs and S3 presigned URLs.",
        ),
    }),

    outputSchema: z.object({
      success: z.boolean(),
      data_type: z.enum(["billing", "contacts"]),
      file_saved: z.string(),
      rows_loaded: z.number(),
      message: z.string(),
    }),

    execute: async ({ context }) => {
      const { data_type, csv_url } = context;

      if (!csv_url || csv_url.trim().length === 0) {
        return {
          success: false,
          data_type,
          file_saved: "",
          rows_loaded: 0,
          message: "CSV URL is empty.",
        };
      }

      const fileName = data_type === "billing" ? "billing.csv" : "contacts.csv";

      try {
        let downloadUrl = csv_url.trim();

        const gdriveMatch = downloadUrl.match(/drive\.google\.com\/file\/d\/([^/]+)/);
        if (gdriveMatch) {
          downloadUrl = `https://drive.google.com/uc?export=download&id=${gdriveMatch[1]}`;
        }

        const response = await fetch(downloadUrl);
        if (!response.ok) {
          throw new Error(`Failed to download CSV: HTTP ${response.status} ${response.statusText}`);
        }

        const csvContent = await response.text();

        if (!csvContent || csvContent.trim().length === 0) {
          throw new Error("Downloaded file is empty.");
        }

        const filePath = saveCsv(fileName, csvContent);
        const rowCount = await reloadView(data_type);

        return {
          success: true,
          data_type,
          file_saved: filePath,
          rows_loaded: rowCount,
          message: `${data_type} data updated successfully. ${rowCount} rows loaded from URL.`,
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          data_type,
          file_saved: "",
          rows_loaded: 0,
          message: `Failed to load CSV: ${errorMsg}`,
        };
      }
    },
  });
