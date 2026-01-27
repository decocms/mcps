/**
 * Session Keeper - Mantém a sessão do Mesh ativa
 *
 * O Mesh desconecta após ~5 minutos de inatividade.
 * Este módulo faz um "ping" periódico para manter a sessão ativa
 * enquanto o bot do Discord estiver rodando.
 */

import type { Env } from "./types/env.ts";

// Intervalo do heartbeat (3 minutos - antes dos 5 min de timeout)
const HEARTBEAT_INTERVAL_MS = 3 * 60 * 1000;

// Máximo de falhas consecutivas antes de parar
const MAX_CONSECUTIVE_FAILURES = 5;

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let consecutiveFailures = 0;
let lastSuccessTime: Date | null = null;
let isSessionValid = true;

// Callback para notificar quando a sessão expira
type SessionExpiredCallback = () => void;
let onSessionExpired: SessionExpiredCallback | null = null;

/**
 * Verifica se a sessão do Mesh está válida fazendo uma requisição leve
 */
async function checkSession(env: Env): Promise<boolean> {
  try {
    const meshUrl = env.MESH_REQUEST_CONTEXT?.meshUrl ?? env.MESH_URL;
    const token = env.MESH_REQUEST_CONTEXT?.token;
    const organizationId = env.MESH_REQUEST_CONTEXT?.organizationId;

    if (!meshUrl || !token || !organizationId) {
      // No Mesh credentials - can't verify, assume valid (bot may work without Mesh)
      console.log(
        "[SessionKeeper] No Mesh credentials to verify - skipping check",
      );
      return true;
    }

    // Faz uma requisição leve para verificar se o token ainda é válido
    // Usa o endpoint de health ou models que é rápido
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch(`${meshUrl}/api/${organizationId}/health`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Se retornou 401/403, sessão expirou
      if (response.status === 401 || response.status === 403) {
        console.log(
          `[SessionKeeper] ❌ Session expired (HTTP ${response.status})`,
        );
        return false;
      }

      // Qualquer resposta 2xx ou 404 (endpoint não existe mas autenticou) é OK
      if (response.ok || response.status === 404) {
        return true;
      }

      // Outros erros - pode ser problema temporário
      console.log(`[SessionKeeper] ⚠️ Unexpected response: ${response.status}`);
      return true; // Assume válido para erros temporários
    } catch (fetchError) {
      clearTimeout(timeout);
      // Erro de rede/timeout - pode ser problema temporário
      const msg =
        fetchError instanceof Error ? fetchError.message : String(fetchError);
      console.log(`[SessionKeeper] ⚠️ Network error: ${msg}`);
      return true; // Assume válido para erros de rede
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[SessionKeeper] Error checking session:", msg);
    return false;
  }
}

/**
 * Executa um heartbeat para manter a sessão ativa
 */
async function doHeartbeat(env: Env): Promise<void> {
  console.log("[SessionKeeper] 💓 Heartbeat...");

  const isValid = await checkSession(env);

  if (isValid) {
    consecutiveFailures = 0;
    lastSuccessTime = new Date();
    isSessionValid = true;
    console.log("[SessionKeeper] ✅ Session valid");
  } else {
    consecutiveFailures++;
    isSessionValid = false;
    console.log(
      `[SessionKeeper] ❌ Session invalid (failures: ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`,
    );

    // Se excedeu o máximo de falhas, notifica e para
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.log("[SessionKeeper] 🛑 Max failures reached - session expired");
      if (onSessionExpired) {
        onSessionExpired();
      }
      stopHeartbeat();
    }
  }
}

/**
 * Inicia o heartbeat para manter a sessão ativa
 */
export function startHeartbeat(
  env: Env,
  onExpired?: SessionExpiredCallback,
): void {
  // Para qualquer heartbeat existente
  stopHeartbeat();

  console.log("[SessionKeeper] 🚀 Starting session keeper...");
  console.log(
    `[SessionKeeper] Heartbeat interval: ${HEARTBEAT_INTERVAL_MS / 1000}s`,
  );

  onSessionExpired = onExpired ?? null;
  consecutiveFailures = 0;
  isSessionValid = true;
  lastSuccessTime = new Date();

  // Faz um heartbeat inicial
  doHeartbeat(env);

  // Configura o intervalo
  heartbeatInterval = setInterval(() => {
    // Importa o getCurrentEnv e getStoredConfig para pegar o env/config mais recente
    import("./bot-manager.ts")
      .then(({ getCurrentEnv, getStoredConfig }) => {
        const currentEnv = getCurrentEnv();
        if (currentEnv) {
          doHeartbeat(currentEnv);
        } else {
          // Fallback: use stored config to do heartbeat
          const storedConfig = getStoredConfig();
          if (storedConfig) {
            // Create a minimal env-like object for heartbeat check
            doHeartbeatWithConfig(storedConfig);
          } else {
            console.log(
              "[SessionKeeper] ⚠️ No env or stored config available for heartbeat",
            );
          }
        }
      })
      .catch((error) => {
        console.error(
          "[SessionKeeper] Failed to import bot-manager:",
          error instanceof Error ? error.message : String(error),
        );
      });
  }, HEARTBEAT_INTERVAL_MS);
}

/**
 * Heartbeat using stored config (fallback when env is not available)
 */
async function doHeartbeatWithConfig(config: {
  meshUrl: string;
  organizationId: string;
  persistentToken: string;
}): Promise<void> {
  console.log("[SessionKeeper] 💓 Heartbeat (using stored config)...");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(
      `${config.meshUrl}/api/${config.organizationId}/health`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.persistentToken}`,
        },
        signal: controller.signal,
      },
    );

    clearTimeout(timeout);

    if (response.status === 401 || response.status === 403) {
      console.log(
        `[SessionKeeper] ❌ Session expired (HTTP ${response.status})`,
      );
      consecutiveFailures++;
      isSessionValid = false;
    } else {
      consecutiveFailures = 0;
      lastSuccessTime = new Date();
      isSessionValid = true;
      console.log("[SessionKeeper] ✅ Session valid");
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`[SessionKeeper] ⚠️ Network error: ${msg}`);
    // Assume valid for network errors
  }
}

/**
 * Para o heartbeat
 */
export function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    console.log("[SessionKeeper] 🛑 Heartbeat stopped");
  }
}

/**
 * Verifica se a sessão está válida
 */
export function isSessionActive(): boolean {
  return isSessionValid;
}

/**
 * Obtém informações sobre o status da sessão
 */
export function getSessionStatus(): {
  isValid: boolean;
  lastSuccess: Date | null;
  consecutiveFailures: number;
  isHeartbeatRunning: boolean;
} {
  return {
    isValid: isSessionValid,
    lastSuccess: lastSuccessTime,
    consecutiveFailures,
    isHeartbeatRunning: heartbeatInterval !== null,
  };
}

/**
 * Força uma verificação de sessão
 */
export async function forceSessionCheck(env: Env): Promise<boolean> {
  const isValid = await checkSession(env);
  isSessionValid = isValid;
  if (isValid) {
    consecutiveFailures = 0;
    lastSuccessTime = new Date();
  }
  return isValid;
}

/**
 * Reseta o estado da sessão (chamado quando o Mesh envia nova configuração)
 */
export function resetSession(): void {
  consecutiveFailures = 0;
  isSessionValid = true;
  lastSuccessTime = new Date();
  console.log("[SessionKeeper] 🔄 Session reset - assuming valid");
}
