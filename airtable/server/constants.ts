export const AIRTABLE_API_BASE = "https://api.airtable.com/v0";
export const MAX_BATCH_RECORDS = 10;
export const MAX_RECORDS_PER_PAGE = 100;

export const AIRTABLE_SCOPES = [
  "data.records:read",
  "data.records:write",
  "schema.bases:read",
  "schema.bases:write",
  "user.email:read",
];
