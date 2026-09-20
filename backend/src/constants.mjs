export const MAX_PLAINTEXT_BYTES = 32 * 1024;
export const MAX_REQUEST_BYTES = 64 * 1024;
export const NEW_ID_LENGTH = 4;
export const LEGACY_ID_LENGTH = 16;
export const ALLOWED_TTLS = new Set([600, 3600, 86400, 604800]);
export const KDF_ITERATIONS = 600_000;

export function nowIso() {
  return new Date().toISOString();
}
