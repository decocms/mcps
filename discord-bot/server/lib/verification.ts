/**
 * Verificação de assinaturas de webhooks do Discord
 * Usa o algoritmo Ed25519 para validar que as requisições vêm do Discord
 */
import nacl from "tweetnacl";

/**
 * Converte string hexadecimal para Uint8Array
 */
function hexToUint8Array(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("Hex string inválido: comprimento ímpar");
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Verifica a assinatura Ed25519 de uma requisição do Discord
 * 
 * @param body - Corpo da requisição em formato de string (não parseado)
 * @param signature - Header X-Signature-Ed25519
 * @param timestamp - Header X-Signature-Timestamp
 * @param publicKey - Chave pública do Discord (obtida no Developer Portal)
 * @returns true se a assinatura é válida, false caso contrário
 */
export async function verifyDiscordSignature(
  body: string,
  signature: string | null,
  timestamp: string | null,
  publicKey: string
): Promise<boolean> {
  if (!signature || !timestamp) {
    console.error("Missing signature or timestamp headers");
    return false;
  }

  try {
    // Validar timestamp (rejeitar requisições muito antigas - > 5 minutos)
    const now = Math.floor(Date.now() / 1000);
    const requestTime = parseInt(timestamp, 10);
    
    if (isNaN(requestTime)) {
      console.error("Invalid timestamp format");
      return false;
    }

    const timeDiff = Math.abs(now - requestTime);
    if (timeDiff > 300) { // 5 minutos
      console.warn(`Request timestamp too old: ${timeDiff}s difference`);
      return false;
    }

    // Construir a mensagem que o Discord assinou
    const message = timestamp + body;

    // Converter de hexadecimal para bytes
    const signatureBytes = hexToUint8Array(signature);
    const publicKeyBytes = hexToUint8Array(publicKey);
    const messageBytes = new TextEncoder().encode(message);

    // Verificar assinatura usando Ed25519
    const isValid = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKeyBytes
    );

    if (!isValid) {
      console.error("Invalid signature");
    }

    return isValid;
  } catch (error) {
    console.error("Error verifying Discord signature:", error);
    return false;
  }
}

/**
 * Extrai os headers de assinatura de uma requisição
 */
export function extractSignatureHeaders(
  request: Request
): { signature: string | null; timestamp: string | null } {
  return {
    signature: request.headers.get("X-Signature-Ed25519"),
    timestamp: request.headers.get("X-Signature-Timestamp"),
  };
}

