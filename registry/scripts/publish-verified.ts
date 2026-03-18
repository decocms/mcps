#!/usr/bin/env bun
/**
 * Script to publish verified MCPs to the store and unlist broken ones
 *
 * - Sets `unlisted = false` and `verified = true` for VERIFIED_SERVERS
 * - Sets `unlisted = true` and `verified = false` for UNLISTED_SERVERS
 * - Applies icon overrides from VERIFIED_SERVER_OVERRIDES
 *
 * Usage:
 *   bun run scripts/publish-verified.ts
 *   bun run scripts/publish-verified.ts --dry-run
 *
 * Environment variables:
 *   SUPABASE_URL - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Supabase service role key
 */

import { createClient } from "@supabase/supabase-js";
import {
  VERIFIED_SERVERS,
  UNLISTED_SERVERS,
  VERIFIED_SERVER_OVERRIDES,
} from "../server/lib/verified.ts";

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("     Publish Verified & Unlist Broken MCPs");
  console.log("═══════════════════════════════════════════════════════════\n");

  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) {
    console.log("🔍 DRY RUN — no changes will be made\n");
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // ── Part 1: Publish verified servers ────────────────────────
  console.log(
    `📋 Verified servers: ${VERIFIED_SERVERS.length} | Unlisted servers: ${UNLISTED_SERVERS.length}\n`,
  );

  // Fetch current state of verified servers
  const { data: current } = await supabase
    .from("mcp_servers")
    .select("name, friendly_name, unlisted, verified, icons")
    .eq("is_latest", true)
    .in("name", VERIFIED_SERVERS);

  const alreadyVisible = current?.filter((r) => !r.unlisted) || [];
  const toPublish = current?.filter((r) => r.unlisted) || [];
  const missing = VERIFIED_SERVERS.filter(
    (name) => !current?.some((r) => r.name === name),
  );

  console.log("── PUBLISH ──");
  console.log(`   Already visible: ${alreadyVisible.length}`);
  alreadyVisible.forEach((r) =>
    console.log(`     ✅ ${r.name} → ${r.friendly_name}`),
  );

  console.log(`\n   To publish: ${toPublish.length}`);
  toPublish.forEach((r) =>
    console.log(`     📦 ${r.name} → ${r.friendly_name}`),
  );

  if (missing.length > 0) {
    console.log(`\n   ⚠️  Not found in DB: ${missing.length}`);
    missing.forEach((name) => console.log(`     ❓ ${name}`));
  }

  if (!dryRun) {
    // Publish new ones
    if (toPublish.length > 0) {
      const namesToPublish = toPublish.map((r) => r.name);
      const { data: updated, error } = await supabase
        .from("mcp_servers")
        .update({
          unlisted: false,
          verified: true,
          updated_at: new Date().toISOString(),
        })
        .in("name", namesToPublish)
        .select("name");

      if (error) {
        console.error(`❌ Publish error: ${error.message}`);
      } else {
        console.log(`\n   ✅ Published ${updated?.length || 0} rows`);
      }
    }

    // Ensure already-visible ones have verified=true
    if (alreadyVisible.length > 0) {
      const visibleNames = alreadyVisible.map((r) => r.name);
      await supabase
        .from("mcp_servers")
        .update({ verified: true, updated_at: new Date().toISOString() })
        .in("name", visibleNames);
      console.log(
        `   ✅ Ensured verified=true on ${alreadyVisible.length} already-visible servers`,
      );
    }

    // ── Apply icon overrides ──────────────────────────────────
    console.log("\n── ICON OVERRIDES ──");
    let iconCount = 0;
    for (const server of [...(current || [])]) {
      const override = VERIFIED_SERVER_OVERRIDES[server.name];
      if (!override?.icons) continue;

      const hasIcons = Array.isArray(server.icons) && server.icons.length > 0;
      if (hasIcons) continue;

      const { error } = await supabase
        .from("mcp_servers")
        .update({
          icons: override.icons,
          updated_at: new Date().toISOString(),
        })
        .eq("name", server.name);

      if (!error) {
        console.log(`   🎨 ${server.name} → ${override.icons[0].src}`);
        iconCount++;
      }
    }
    console.log(`   ✅ Applied ${iconCount} icon overrides`);
  }

  // ── Part 2: Unlist broken MCPs ──────────────────────────────
  console.log("\n── UNLIST ──");

  const { data: toUnlistData } = await supabase
    .from("mcp_servers")
    .select("name, friendly_name, unlisted, verified")
    .eq("is_latest", true)
    .in("name", UNLISTED_SERVERS);

  const currentlyListed =
    toUnlistData?.filter((r) => !r.unlisted || r.verified) || [];
  const alreadyUnlisted =
    toUnlistData?.filter((r) => r.unlisted && !r.verified) || [];

  console.log(`   Already unlisted: ${alreadyUnlisted.length}`);
  console.log(`   To unlist: ${currentlyListed.length}`);
  currentlyListed.forEach((r) =>
    console.log(`     🚫 ${r.name} → ${r.friendly_name}`),
  );

  if (!dryRun && currentlyListed.length > 0) {
    const namesToUnlist = currentlyListed.map((r) => r.name);
    const { data: unlisted, error } = await supabase
      .from("mcp_servers")
      .update({
        unlisted: true,
        verified: false,
        updated_at: new Date().toISOString(),
      })
      .in("name", namesToUnlist)
      .select("name");

    if (error) {
      console.error(`❌ Unlist error: ${error.message}`);
    } else {
      console.log(`\n   ✅ Unlisted ${unlisted?.length || 0} rows`);
    }
  }

  // ── Summary ─────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════");
  if (dryRun) {
    console.log("   DRY RUN complete — no changes made.");
  } else {
    console.log("                        DONE!");
  }
  console.log("═══════════════════════════════════════════════════════════");
}

main();
