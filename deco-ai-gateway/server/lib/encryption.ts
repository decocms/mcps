import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

interface EncryptedData {
  ciphertext: string;
  iv: string;
  tag: string;
}

function getEncryptionKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is required (64 hex characters = 32 bytes)",
    );
  }
  if (keyHex.length !== 64) {
    throw new Error(
      `ENCRYPTION_KEY must be 64 hex characters (got ${keyHex.length})`,
    );
  }
  return Buffer.from(keyHex, "hex");
}

export function encrypt(plaintext: string): EncryptedData {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");

  return {
    ciphertext: encrypted,
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
  };
}

export function decrypt(data: EncryptedData): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(data.iv, "hex");
  const tag = Buffer.from(data.tag, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(data.ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
