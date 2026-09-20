import { createHash } from 'node:crypto';
import { ALLOWED_TTLS, KDF_ITERATIONS, MAX_PLAINTEXT_BYTES } from './constants.mjs';
import { HttpError } from './errors.mjs';

const ID_RE = /^[A-Za-z0-9_-]{16}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

function requiredString(value, field, maxLength) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throw new HttpError(400, 'invalid_request');
  }
  return value;
}

function validateBase64Url(value, field, minBytes, maxBytes) {
  requiredString(value, field, maxBytes * 2);
  if (!BASE64URL_RE.test(value) || value.length % 4 === 1) throw new HttpError(400, 'invalid_request');
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.length < minBytes || bytes.length > maxBytes) throw new HttpError(400, 'invalid_request');
  return value;
}

export function parseId(value) {
  if (typeof value !== 'string' || !ID_RE.test(value)) throw new HttpError(404, 'not_found');
  return value;
}

export function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('base64url');
}

export function validateCreatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new HttpError(400, 'invalid_request');
  const allowed = new Set(['v', 'alg', 'kdf', 'iterations', 'salt', 'iv', 'ciphertext', 'size', 'ttlSeconds', 'deleteAfterRead', 'deleteToken']);
  for (const key of Object.keys(payload)) if (!allowed.has(key)) throw new HttpError(400, 'invalid_request');
  if (payload.v !== 1 || payload.alg !== 'AES-256-GCM' || payload.kdf !== 'PBKDF2-SHA256' || payload.iterations !== KDF_ITERATIONS) {
    throw new HttpError(400, 'invalid_request');
  }
  if (!Number.isInteger(payload.size) || payload.size < 0 || payload.size > MAX_PLAINTEXT_BYTES) throw new HttpError(400, 'invalid_request');
  if (!ALLOWED_TTLS.has(payload.ttlSeconds) || typeof payload.deleteAfterRead !== 'boolean') throw new HttpError(400, 'invalid_request');
  validateBase64Url(payload.salt, 'salt', 16, 16);
  validateBase64Url(payload.iv, 'iv', 12, 12);
  const ciphertextBytes = Buffer.from(requiredString(payload.ciphertext, 'ciphertext', 90_000), 'base64url');
  if (!BASE64URL_RE.test(payload.ciphertext) || ciphertextBytes.length < 16 || ciphertextBytes.length > MAX_PLAINTEXT_BYTES + 16 || payload.size > ciphertextBytes.length - 16) {
    throw new HttpError(400, 'invalid_request');
  }
  if (!TOKEN_RE.test(payload.deleteToken)) throw new HttpError(400, 'invalid_request');
  return {
    v: payload.v,
    alg: payload.alg,
    kdf: payload.kdf,
    iterations: payload.iterations,
    salt: payload.salt,
    iv: payload.iv,
    ciphertext: payload.ciphertext,
    size: payload.size,
    ttlSeconds: payload.ttlSeconds,
    deleteAfterRead: payload.deleteAfterRead,
    deleteTokenHash: hashToken(payload.deleteToken),
  };
}

export function validateDeleteToken(value) {
  if (typeof value !== 'string' || !TOKEN_RE.test(value)) throw new HttpError(401, 'unauthorized');
  return hashToken(value);
}
