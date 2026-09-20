# API contract

All successful and error responses are JSON with `Cache-Control: no-store`.
Production CORS is an exact origin allowlist. The API never accepts cookies or
passwords.

## POST `/pastes`

В локальном dev-сервере тот же маршрут доступен как `/api/pastes` через Vite
proxy.

`Content-Type: application/json`

```json
{
  "v": 1,
  "alg": "AES-256-GCM",
  "kdf": "PBKDF2-SHA256",
  "iterations": 600000,
  "salt": "base64url",
  "iv": "base64url",
  "ciphertext": "base64url",
  "size": 123,
  "ttlSeconds": 86400,
  "deleteAfterRead": false,
  "deleteToken": "random-token-kept-in-creator-memory"
}
```

Response `201`:

```json
{ "id": "aB3_", "expiresAt": "2026-01-01T00:00:00.000Z" }
```

New IDs are four URL-safe characters. Existing sixteen-character IDs remain
valid for backwards compatibility.

The delete token is hashed before persistence. It is not returned in the public
read link.

## GET `/pastes/{id}`

Returns the versioned encrypted envelope. For `deleteAfterRead: true`, it also
returns a short-lived-in-practice `readDeleteToken`. The token is a deletion
credential, not a proof of successful decryption.

## DELETE `/pastes/{id}`

Send either `X-Delete-Token` (creator) or `X-Read-Delete-Token` (reader). The
server compares only SHA-256 token hashes and returns `404` for missing,
expired or incorrectly authorized notes, avoiding extra enumeration detail.
