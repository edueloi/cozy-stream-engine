// AES-256-GCM envelope for provider secrets. Server-only.
// Reads PROVIDER_SECRET_MASTER_KEY (hex or utf8; hashed to 32 bytes via SHA-256).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function key(): Buffer {
  const raw = process.env.PROVIDER_SECRET_MASTER_KEY;
  if (!raw) throw new Error("PROVIDER_SECRET_MASTER_KEY not set");
  return createHash("sha256").update(raw).digest();
}

export interface SealedSecret {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

export function sealSecret(plaintext: string): SealedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { ciphertext: ct, iv, authTag: cipher.getAuthTag() };
}

export function openSecret(sealed: SealedSecret): string {
  const decipher = createDecipheriv("aes-256-gcm", key(), sealed.iv);
  decipher.setAuthTag(sealed.authTag);
  const pt = Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]);
  return pt.toString("utf8");
}

export function last4(value: string): string {
  const clean = value.replace(/\s+/g, "");
  return clean.slice(-4).padStart(4, "•");
}

export function makeReference(orgId: string, provider: string): string {
  return `org:${orgId}:provider:${provider}`;
}