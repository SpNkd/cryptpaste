import type { EncryptedEnvelope } from './crypto';

export type CreateRequest = EncryptedEnvelope & {
  ttlSeconds: 600 | 3600 | 86400 | 604800;
  deleteAfterRead: boolean;
  deleteToken: string;
};

export type CreateResponse = { id: string; expiresAt: string };
export type ReadResponse = EncryptedEnvelope & {
  deleteAfterRead: boolean;
  readDeleteToken?: string;
};

const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}${url}`, {
      ...init,
      headers: { Accept: 'application/json', ...init?.headers },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ApiError(0, 'Сервис недоступен. Проверьте соединение и попробуйте ещё раз.');
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Keep a generic error below; do not expose a proxy or provider response.
  }
  if (!response.ok) {
    const message = response.status === 404
      ? 'Заметка не найдена или срок её жизни истёк.'
      : response.status === 413
        ? 'Заметка слишком большая.'
        : response.status === 429
          ? 'Слишком много запросов. Попробуйте чуть позже.'
          : 'Не удалось выполнить запрос. Попробуйте ещё раз.';
    throw new ApiError(response.status, message);
  }
  return payload as T;
}

export function createPaste(payload: CreateRequest): Promise<CreateResponse> {
  return request<CreateResponse>('/pastes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function getPaste(id: string): Promise<ReadResponse> {
  return request<ReadResponse>(`/pastes/${encodeURIComponent(id)}`);
}

export function deletePaste(id: string, token: string, mode: 'owner' | 'read'): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/pastes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { [mode === 'owner' ? 'X-Delete-Token' : 'X-Read-Delete-Token']: token },
  });
}

export function getApiBase(): string {
  return apiBase;
}
