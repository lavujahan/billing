import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM with the master key from AI_KEY_ENCRYPTION_KEY (32 bytes, base64). The master key
// lives only in the server environment, so a database backup alone never reveals an API key.
function masterKey(): Buffer {
  const raw = process.env.AI_KEY_ENCRYPTION_KEY;
  const key = raw ? Buffer.from(raw, "base64") : null;
  if (!key || key.length !== 32) throw new Error("AI_KEY_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return key;
}

export function hasMasterKey() {
  try {
    masterKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function decryptSecret(encoded: string): string {
  const buf = Buffer.from(encoded, "base64");
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}
