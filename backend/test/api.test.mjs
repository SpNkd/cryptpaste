import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.STORAGE = 'memory';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';
const { handler, resetForTests } = await import('../src/handler.mjs');

const origin = 'http://localhost:5173';
const token = 't'.repeat(43);

function envelope(overrides = {}) {
  return {
    v: 1,
    alg: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: 600_000,
    salt: Buffer.alloc(16, 1).toString('base64url'),
    iv: Buffer.alloc(12, 2).toString('base64url'),
    ciphertext: Buffer.alloc(16, 3).toString('base64url'),
    size: 0,
    ttlSeconds: 600,
    deleteAfterRead: false,
    deleteToken: token,
    ...overrides,
  };
}

function event(method, path, body = '', headers = {}) {
  return {
    httpMethod: method,
    path,
    headers: { origin, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    requestContext: { http: { sourceIp: '127.0.0.1' } },
  };
}

async function create(overrides = {}) {
  const result = await handler(event('POST', '/api/pastes', envelope(overrides), { 'content-type': 'application/json' }));
  assert.equal(result.statusCode, 201);
  return JSON.parse(result.body);
}

beforeEach(() => resetForTests());

test('creates and reads only encrypted envelope, then deletes with hashed owner token', async () => {
  const created = await create();
  assert.match(created.id, /^[A-Za-z0-9_-]{4}$/);
  const read = await handler(event('GET', `/api/pastes/${created.id}`));
  assert.equal(read.statusCode, 200);
  const payload = JSON.parse(read.body);
  assert.equal(payload.ciphertext, Buffer.alloc(16, 3).toString('base64url'));
  assert.equal('password' in payload, false);
  assert.equal('plaintext' in payload, false);
  const templateRead = await handler({
    ...event('GET', '/api/pastes/{id}'),
    pathParams: { id: created.id },
  });
  assert.equal(templateRead.statusCode, 200);

  const wrong = await handler(event('DELETE', `/api/pastes/${created.id}`, '', { 'X-Delete-Token': 'w'.repeat(43) }));
  assert.equal(wrong.statusCode, 404);
  const deleted = await handler(event('DELETE', `/api/pastes/${created.id}`, '', { 'X-Delete-Token': token }));
  assert.equal(deleted.statusCode, 200);
  const missing = await handler(event('GET', `/api/pastes/${created.id}`));
  assert.equal(missing.statusCode, 404);
});

test('delete-after-read issues a separate read-delete token', async () => {
  const created = await create({ deleteAfterRead: true });
  const read = await handler(event('GET', `/api/pastes/${created.id}`));
  assert.equal(read.statusCode, 200);
  const readPayload = JSON.parse(read.body);
  assert.match(readPayload.readDeleteToken, /^[A-Za-z0-9_-]{43}$/);
  const deleted = await handler(event('DELETE', `/api/pastes/${created.id}`, '', { 'X-Read-Delete-Token': readPayload.readDeleteToken }));
  assert.equal(deleted.statusCode, 200);
  assert.equal((await handler(event('GET', `/api/pastes/${created.id}`))).statusCode, 404);
});

test('validates content type, body and nonexistent identifiers', async () => {
  assert.equal((await handler(event('POST', '/api/pastes', envelope()))).statusCode, 415);
  assert.equal((await handler(event('POST', '/api/pastes', { ...envelope(), size: 33 * 1024 }, { 'content-type': 'application/json' }))).statusCode, 400);
  assert.equal((await handler(event('GET', '/api/pastes/aaaaaaaaaaaaaaaa'))).statusCode, 404);
  assert.equal((await handler(event('GET', '/api/pastes/abcd'))).statusCode, 404);
  assert.equal((await handler(event('GET', '/api/pastes/not-an-id'))).statusCode, 404);
});

test('returns exact allowed CORS origin and rejects another origin', async () => {
  const preflight = await handler(event('OPTIONS', '/api/pastes', '', { 'access-control-request-method': 'POST' }));
  assert.equal(preflight.statusCode, 204);
  assert.equal(preflight.headers['Access-Control-Allow-Origin'], origin);
  const forbidden = await handler({ ...event('GET', '/health'), headers: { origin: 'https://evil.example' } });
  assert.equal(forbidden.statusCode, 403);
});
