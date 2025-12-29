/**
 * Script de Teste para a API do Grain
 *
 * Como usar:
 * 1. Configure sua API key: export GRAIN_API_KEY="grain_pat_sua_chave_aqui"
 * 2. Execute: bun run test-api.ts
 */

export const GRAIN_API_KEY =
  "grain_pat_D8cA1jPA_o5wZm1w4uIU9IyjhXpUOa4QBsvRi65T4zpxYYUjk";

/* const GRAIN_API_KEY = process.env.GRAIN_API_KEY; */

if (!GRAIN_API_KEY) {
  console.error("❌ ERRO: GRAIN_API_KEY não está configurada!");
  console.error("\nPara configurar:");
  console.error('  export GRAIN_API_KEY="grain_pat_sua_chave_aqui"\n');
  process.exit(1);
}

const GRAIN_BASE_URL = "https://api.grain.com";

async function testListRecordings() {
  console.log("\n📋 Testando LIST RECORDINGS...\n");
  console.log("✅ Nota: Grain API usa GET com query parameters!\n");

  try {
    // Rota correta descoberta via Insomnia
    const url = new URL(`${GRAIN_BASE_URL}/_/public-api/recordings`);
    url.searchParams.append("limit", "100");
    url.searchParams.append("offset", "0");

    console.log(`🔍 URL: ${url.toString()}`);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${GRAIN_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    console.log(`Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Erro na resposta:");
      console.error(errorText);
      return null;
    }

    const data = await response.json();
    console.log("\n✅ Sucesso! Dados recebidos:");
    console.log(JSON.stringify(data, null, 2));

    return data;
  } catch (error) {
    console.error("❌ Erro na requisição:", error);
    return null;
  }
}

async function testGetRecording(recordingId: string) {
  console.log(`\n📄 Testando GET RECORDING para ID: ${recordingId}...\n`);

  try {
    const response = await fetch(
      `${GRAIN_BASE_URL}/_/public-api/recordings/${recordingId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${GRAIN_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      },
    );

    console.log(`Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Erro na resposta:");
      console.error(errorText);
      return null;
    }

    const data = await response.json();
    console.log("\n✅ Sucesso! Detalhes da gravação:");
    console.log(JSON.stringify(data, null, 2));

    return data;
  } catch (error) {
    console.error("❌ Erro na requisição:", error);
    return null;
  }
}

async function testSearchRecordings(query: string) {
  console.log(`\n🔍 Testando SEARCH RECORDINGS com query: "${query}"...\n`);

  try {
    const url = new URL(`${GRAIN_BASE_URL}/_/public-api/recordings`);
    url.searchParams.append("search", query);
    url.searchParams.append("limit", "50");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${GRAIN_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    console.log(`Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Erro na resposta:");
      console.error(errorText);
      return null;
    }

    const data = await response.json();
    console.log("\n✅ Sucesso! Resultados da busca:");
    console.log(JSON.stringify(data, null, 2));

    return data;
  } catch (error) {
    console.error("❌ Erro na requisição:", error);
    return null;
  }
}

// Função principal
async function main() {
  console.log("🚀 Iniciando testes da API Grain...");
  console.log(`📍 Base URL: ${GRAIN_BASE_URL}`);
  console.log(`🔑 API Key: ${GRAIN_API_KEY?.substring(0, 20)}...`);

  // Teste 1: Listar gravações
  const recordings = await testListRecordings();

  // Se conseguimos listar gravações, testamos pegar uma específica
  if (recordings && recordings.recordings && recordings.recordings.length > 0) {
    const firstRecording = recordings.recordings[0];
    console.log(`\n📌 Primeira gravação encontrada: ${firstRecording.id}`);

    // Teste 2: Pegar detalhes da primeira gravação
    await testGetRecording(firstRecording.id);

    // Teste 3: Buscar pela primeira palavra do título
    if (firstRecording.title) {
      const searchTerm = firstRecording.title.split(" ")[0];
      await testSearchRecordings(searchTerm);
    }
  } else {
    console.log("\n⚠️  Nenhuma gravação encontrada para testar GET.");
    console.log("Verifique se você tem gravações no seu Grain account.");
  }

  console.log("\n✨ Testes concluídos!\n");
}

// Executar
main().catch(console.error);
