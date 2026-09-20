import { randomBytes } from 'node:crypto';
import { MAX_REQUEST_BYTES } from './constants.mjs';
import { DuplicateIdError, HttpError, StorageError } from './errors.mjs';
import { createRepository } from './repository.mjs';
import { hashToken, parseId, validateCreatePayload, validateDeleteToken } from './validation.mjs';

const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(/[;,]/).map((origin) => origin.trim()).filter(Boolean));
const rateWindowMs = 60_000;
const rateLimit = new Map();
let repository;

function getRepository() {
  repository ||= createRepository();
  return repository;
}

function header(headers, name) {
  if (!headers) return '';
  const expected = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === expected);
  return typeof entry?.[1] === 'string' ? entry[1] : Array.isArray(entry?.[1]) ? entry[1][0] : '';
}

function sourceIp(request) {
  return request.sourceIp || header(request.headers, 'x-forwarded-for').split(',')[0].trim() || 'unknown';
}

function limited(key, max) {
  const now = Date.now();
  const current = rateLimit.get(key);
  if (!current || current.expiresAt <= now) {
    rateLimit.set(key, { count: 1, expiresAt: now + rateWindowMs });
    return false;
  }
  current.count += 1;
  return current.count > max;
}

function randomId() {
  return randomBytes(12).toString('base64url');
}

function response(statusCode, body, origin = '') {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  };
  if (origin && allowedOrigins.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  return { statusCode, headers, isBase64Encoded: false, body: JSON.stringify(body) };
}

function requestFromEvent(event) {
  const headers = event?.headers || {};
  const method = event?.httpMethod || event?.requestContext?.http?.method || 'GET';
  const pathParams = event?.pathParams || event?.pathParameters || event?.params || event?.parameters || {};
  let path = event?.url || event?.rawPath || event?.path || event?.requestContext?.http?.path || '/';
  const pasteId = pathParams?.id;
  if (pasteId && (path.includes('{id}') || !path.match(/\/pastes\/[^/]+$/))) {
    path = path.replace('{id}', encodeURIComponent(pasteId));
    if (!path.match(/\/pastes\/[^/]+$/)) path = `${path.replace(/\/+$/, '')}/${encodeURIComponent(pasteId)}`;
  }
  const source = event?.requestContext?.http?.sourceIp || sourceIp({ headers });
  let body = event?.body || '';
  if (event?.isBase64Encoded && body) body = Buffer.from(body, 'base64').toString('utf8');
  return { method: method.toUpperCase(), path, headers, body, sourceIp: source };
}

function jsonBody(request) {
  if (Buffer.byteLength(request.body || '', 'utf8') > MAX_REQUEST_BYTES) throw new HttpError(413, 'payload_too_large');
  if (!request.body) throw new HttpError(400, 'invalid_request');
  try { return JSON.parse(request.body); } catch { throw new HttpError(400, 'invalid_request'); }
}

function normalizedPath(path) {
  const withoutQuery = path.split('?')[0].replace(/\/+$/, '') || '/';
  return withoutQuery.replace(/^\/api(?=\/|$)/, '') || '/';
}

function publicEnvelope(row, readDeleteToken) {
  return {
    v: row.v,
    alg: row.alg,
    kdf: row.kdf,
    iterations: row.iterations,
    salt: row.salt,
    iv: row.iv,
    ciphertext: row.ciphertext,
    size: row.size,
    deleteAfterRead: row.deleteAfterRead,
    ...(readDeleteToken ? { readDeleteToken } : {}),
  };
}

async function createNote(request) {
  if (limited(`create:${request.sourceIp}`, 30)) throw new HttpError(429, 'rate_limited');
  if (!header(request.headers, 'content-type').toLowerCase().startsWith('application/json')) throw new HttpError(415, 'unsupported_media_type');
  const payload = validateCreatePayload(jsonBody(request));
  const now = Date.now();
  const rowBase = {
    ciphertext: payload.ciphertext,
    salt: payload.salt,
    iv: payload.iv,
    kdf: payload.kdf,
    iterations: payload.iterations,
    alg: payload.alg,
    v: payload.v,
    ownerDeleteTokenHash: payload.deleteTokenHash,
    readDeleteTokenHash: null,
    deleteAfterRead: payload.deleteAfterRead,
    size: payload.size,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + payload.ttlSeconds * 1000).toISOString(),
  };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const row = { ...rowBase, id: randomId() };
    try {
      await getRepository().insert(row);
      return response(201, { id: row.id, expiresAt: row.expiresAt }, header(request.headers, 'origin'));
    } catch (error) {
      if (error instanceof DuplicateIdError) continue;
      throw error;
    }
  }
  throw new StorageError(new Error('id_collision_retry_exhausted'));
}

async function readNote(request, id) {
  const row = await getRepository().get(parseId(id));
  if (!row) throw new HttpError(404, 'not_found');
  let readDeleteToken = null;
  if (row.deleteAfterRead) {
    readDeleteToken = randomBytes(32).toString('base64url');
    await getRepository().issueReadDeleteToken(row.id, hashToken(readDeleteToken));
  }
  return response(200, publicEnvelope(row, readDeleteToken), header(request.headers, 'origin'));
}

async function deleteNote(request, id) {
  if (limited(`delete:${request.sourceIp}`, 60)) throw new HttpError(429, 'rate_limited');
  const ownerToken = header(request.headers, 'x-delete-token');
  const readToken = header(request.headers, 'x-read-delete-token');
  if ((ownerToken && readToken) || (!ownerToken && !readToken)) throw new HttpError(401, 'unauthorized');
  const mode = ownerToken ? 'owner' : 'read';
  const tokenHash = validateDeleteToken(ownerToken || readToken);
  const deleted = await getRepository().deleteByToken(parseId(id), tokenHash, mode);
  if (!deleted) throw new HttpError(404, 'not_found');
  return response(200, { deleted: true }, header(request.headers, 'origin'));
}

export async function handler(event) {
  const request = requestFromEvent(event);
  const origin = header(request.headers, 'origin');
  if (origin && !allowedOrigins.has(origin)) return response(403, { error: 'forbidden' });
  if (request.method === 'OPTIONS') {
    if (!origin) return response(204, {});
    return {
      ...response(204, {}, origin),
      headers: {
        ...response(204, {}, origin).headers,
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Accept, Content-Type, X-Delete-Token, X-Read-Delete-Token',
        'Access-Control-Max-Age': '600',
      },
      body: '',
    };
  }
  try {
    const path = normalizedPath(request.path);
    if (request.method === 'GET' && path === '/health') return response(200, { ok: true }, origin);
    if (path === '/pastes' && request.method === 'POST') return await createNote(request);
    const match = path.match(/^\/pastes\/([A-Za-z0-9_-]+)$/);
    if (match && request.method === 'GET') return await readNote(request, match[1]);
    if (match && request.method === 'DELETE') return await deleteNote(request, match[1]);
    throw new HttpError(404, 'not_found');
  } catch (error) {
    if (error instanceof HttpError) return response(error.status, { error: error.code }, origin);
    console.error('request_failed', { name: error?.name || 'Error' });
    return response(500, { error: 'service_unavailable' }, origin);
  }
}

export function resetForTests() {
  repository = undefined;
  rateLimit.clear();
}
