import { Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`.execute(db);

  await db.schema
    .createTable("reports")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("collection_id", "text", (col) => col.notNull())
    .addColumn("summary", "text", (col) => col.notNull())
    .addColumn("date", "timestamptz", (col) => col.notNull())
    .addColumn("criterios", "jsonb", (col) => col.notNull())
    .addColumn("metricas", "jsonb", (col) => col.notNull())
    .addColumn("ranked_list", "jsonb", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex("idx_reports_collection_id")
    .on("reports")
    .column("collection_id")
    .execute();

  await db.schema
    .createIndex("idx_reports_date")
    .on("reports")
    .column("date")
    .execute();

  await db.schema
    .createTable("collections")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("collection_id", "integer", (col) => col.notNull().unique())
    .addColumn("nome", "text", (col) => col.notNull())
    .addColumn("is_enable", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex("idx_collections_is_enable")
    .on("collections")
    .column("is_enable")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("reports").ifExists().execute();
  await db.schema.dropTable("collections").ifExists().execute();
}
