export const MAX_PLAINTEXT_BYTES = 32 * 1024;
export const PBKDF2_ITERATIONS = 600_000;
export const ENVELOPE_VERSION = 1;

export type EncryptedEnvelope = {
  v: 1;
  alg: 'AES-256-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  size: number;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const asBufferSource = (bytes: Uint8Array): BufferSource => bytes as unknown as BufferSource;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('invalid-encoding');
  }
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', asBufferSource(encoder.encode(password)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: asBufferSource(salt), iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptText(text: string, password: string): Promise<EncryptedEnvelope> {
  const plaintext = encoder.encode(text);
  if (plaintext.byteLength > MAX_PLAINTEXT_BYTES) {
    throw new Error('text-too-large');
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: asBufferSource(iv), tagLength: 128 }, key, asBufferSource(plaintext));
  return {
    v: ENVELOPE_VERSION,
    alg: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToBase64Url(salt),
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(encrypted)),
    size: plaintext.byteLength,
  };
}

export async function decryptText(envelope: EncryptedEnvelope, password: string): Promise<string> {
  validateEnvelope(envelope);
  const salt = base64UrlToBytes(envelope.salt);
  const iv = base64UrlToBytes(envelope.iv);
  const ciphertext = base64UrlToBytes(envelope.ciphertext);
  if (salt.byteLength !== 16 || iv.byteLength !== 12 || ciphertext.byteLength < 16) {
    throw new Error('invalid-envelope');
  }
  const key = await deriveKey(password, salt, envelope.iterations);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: asBufferSource(iv), tagLength: 128 }, key, asBufferSource(ciphertext));
  if (plaintext.byteLength !== envelope.size || plaintext.byteLength > MAX_PLAINTEXT_BYTES) {
    throw new Error('invalid-envelope');
  }
  return decoder.decode(plaintext);
}

export function randomToken(byteLength = 32): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export function validateEnvelope(value: unknown): asserts value is EncryptedEnvelope {
  if (!value || typeof value !== 'object') throw new Error('invalid-envelope');
  const candidate = value as Partial<EncryptedEnvelope>;
  if (
    candidate.v !== 1 ||
    candidate.alg !== 'AES-256-GCM' ||
    candidate.kdf !== 'PBKDF2-SHA256' ||
    candidate.iterations !== PBKDF2_ITERATIONS ||
    typeof candidate.salt !== 'string' ||
    typeof candidate.iv !== 'string' ||
    typeof candidate.ciphertext !== 'string' ||
    !Number.isInteger(candidate.size) ||
    (candidate.size as number) < 0 ||
    (candidate.size as number) > MAX_PLAINTEXT_BYTES
  ) {
    throw new Error('invalid-envelope');
  }
}
