export class HttpError extends Error {
  constructor(status, code = 'request_failed') {
    super(code);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export class DuplicateIdError extends Error {
  constructor() {
    super('duplicate_id');
    this.name = 'DuplicateIdError';
  }
}

export class StorageError extends Error {
  constructor(cause) {
    super('storage_error', { cause });
    this.name = 'StorageError';
  }
}
