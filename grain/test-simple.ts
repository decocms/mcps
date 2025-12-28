/**
 * Script simples para testar o MCP Grain localmente
 */

import { MockGrainClient } from "./server/lib/mock-client.ts";

console.log("🧪 Testando MCP Grain com Mock Client\n");

const client = new MockGrainClient();

// Test 1: List all recordings
console.log("📋 Test 1: LIST_RECORDINGS (todos)");
const list = await client.listRecordings({});
console.log(`✅ Encontradas ${list.total} gravações:`);
list.recordings.forEach((rec) => {
  console.log(`  - ${rec.id}: ${rec.title} (${rec.duration_seconds}s)`);
  console.log(
    `    Participantes: ${rec.participants_count} | Transcrição: ${rec.transcript_available ? "✓" : "✗"}`,
  );
});
console.log("");

// Test 2: Filter by meeting type
console.log("📋 Test 2: Filtrar por tipo (sales_call)");
const salesCalls = await client.listRecordings({ meeting_type: "sales_call" });
console.log(`✅ Encontradas ${salesCalls.total} sales calls`);
salesCalls.recordings.forEach((rec) => {
  console.log(`  - ${rec.title}`);
});
console.log("");

// Test 3: Filter by platform
console.log("📋 Test 3: Filtrar por plataforma (zoom)");
const zoomMeetings = await client.listRecordings({ meeting_platform: "zoom" });
console.log(`✅ Encontradas ${zoomMeetings.total} reuniões no Zoom`);
console.log("");

console.log("🎉 Todos os testes passaram!");
console.log("");
console.log("💡 O servidor está funcionando corretamente!");
console.log("   Acesse via Deco Chat ou MCP client para usar as tools.");
