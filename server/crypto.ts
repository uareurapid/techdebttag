// ─── Token Encryption ──────────────────────────────────────

import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_HEX = process.env.ENCRYPTION_KEY || '';
const KEY = KEY_HEX ? Buffer.from(KEY_HEX, 'hex') : null;

if (!KEY || KEY.length !== 32) {
  console.warn('⚠️  ENCRYPTION_KEY not set or invalid (must be 64 hex chars / 32 bytes). Tokens stored as plaintext.');
}

export function encrypt(plaintext: string): string {
  if (!KEY || KEY.length !== 32 || !plaintext) return plaintext;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(encrypted: string): string {
  if (!KEY || KEY.length !== 32 || !encrypted) return encrypted;
  if (!encrypted.includes(':')) return encrypted; // Not encrypted (legacy plaintext)
  const parts = encrypted.split(':');
  if (parts.length !== 3) return encrypted;
  const [ivHex, authTagHex, ciphertextHex] = parts;
  try {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]);
    return decrypted.toString('utf-8');
  } catch {
    return encrypted; // Decryption failed, return as-is (legacy or corrupted)
  }
}
