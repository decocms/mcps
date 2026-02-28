import { Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE reports
    ALTER COLUMN collection_id TYPE integer
    USING collection_id::integer
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE reports
    ALTER COLUMN collection_id TYPE text
    USING collection_id::text
  `.execute(db);
}
