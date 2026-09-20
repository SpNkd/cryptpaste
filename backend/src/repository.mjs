import { Driver } from '@ydbjs/core';
import { EnvironCredentialsProvider } from '@ydbjs/auth/environ';
import { query } from '@ydbjs/query';
import { Timestamp, Uint32, Uint64 } from '@ydbjs/value/primitive';
import { DuplicateIdError, StorageError } from './errors.mjs';

function isDuplicate(error) {
  const message = String(error?.message || error).toLowerCase();
  return message.includes('already exists') || message.includes('precondition_failed') || message.includes('write_conflict');
}

export class MemoryRepository {
  constructor(clock = () => Date.now()) {
    this.rows = new Map();
    this.clock = clock;
  }

  async insert(row) {
    if (this.rows.has(row.id)) throw new DuplicateIdError();
    this.rows.set(row.id, { ...row });
  }

  async get(id) {
    const row = this.rows.get(id);
    if (!row) return null;
    if (new Date(row.expiresAt).getTime() <= this.clock()) {
      this.rows.delete(id);
      return null;
    }
    return { ...row };
  }

  async issueReadDeleteToken(id, tokenHash) {
    const row = await this.get(id);
    if (!row) return false;
    row.readDeleteTokenHash = tokenHash;
    this.rows.set(id, row);
    return true;
  }

  async deleteByToken(id, tokenHash, mode) {
    const row = await this.get(id);
    if (!row) return false;
    const expected = mode === 'owner' ? row.ownerDeleteTokenHash : row.readDeleteTokenHash;
    if (!expected || expected !== tokenHash) return false;
    this.rows.delete(id);
    return true;
  }
}

export class YdbRepository {
  constructor({ connectionString = process.env.YDB_CONNECTION_STRING, tablePath = process.env.YDB_TABLE_PATH } = {}) {
    if (!connectionString || !tablePath) throw new Error('YDB_CONNECTION_STRING and YDB_TABLE_PATH are required');
    this.connectionString = connectionString;
    this.tablePath = tablePath;
    this.driver = null;
    this.sql = null;
  }

  async ensureConnection() {
    if (this.sql) return this.sql;
    const credentialsProvider = new EnvironCredentialsProvider(this.connectionString);
    this.driver = new Driver(this.connectionString, { credentialsProvider, secureOptions: credentialsProvider.secureOptions });
    await this.driver.ready();
    this.sql = query(this.driver);
    return this.sql;
  }

  async insert(row) {
    const sql = await this.ensureConnection();
    try {
      await sql`
        INSERT INTO ${sql.identifier(this.tablePath)}
          (id, ciphertext, salt, iv, kdf, kdf_iterations, algorithm, version,
           owner_delete_token_hash, read_delete_token_hash, delete_after_read,
           size_bytes, created_at, expires_at)
        VALUES (
          ${row.id}, ${row.ciphertext}, ${row.salt}, ${row.iv}, ${row.kdf},
          ${new Uint64(BigInt(row.iterations))}, ${row.alg}, ${new Uint32(row.v)},
          ${row.ownerDeleteTokenHash}, ${row.readDeleteTokenHash || ''},
          ${row.deleteAfterRead}, ${new Uint64(BigInt(row.size))},
          ${new Timestamp(new Date(row.createdAt))}, ${new Timestamp(new Date(row.expiresAt))}
        )
      `;
    } catch (error) {
      if (isDuplicate(error)) throw new DuplicateIdError();
      throw new StorageError(error);
    }
  }

  async get(id) {
    const sql = await this.ensureConnection();
    try {
      const [rows] = await sql`
        SELECT id, ciphertext, salt, iv, kdf, kdf_iterations, algorithm, version,
               owner_delete_token_hash, read_delete_token_hash, delete_after_read,
               size_bytes, created_at, expires_at
        FROM ${sql.identifier(this.tablePath)} WHERE id = ${id}
      `;
      const row = rows?.[0];
      if (!row) return null;
      const expiresAt = row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at);
      if (expiresAt.getTime() <= Date.now()) {
        await this.deleteByToken(id, row.owner_delete_token_hash, 'owner');
        return null;
      }
      return {
        id: row.id,
        ciphertext: row.ciphertext,
        salt: row.salt,
        iv: row.iv,
        kdf: row.kdf,
        iterations: Number(row.kdf_iterations),
        alg: row.algorithm,
        v: Number(row.version),
        ownerDeleteTokenHash: row.owner_delete_token_hash,
        readDeleteTokenHash: row.read_delete_token_hash || null,
        deleteAfterRead: Boolean(row.delete_after_read),
        size: Number(row.size_bytes),
        createdAt: new Date(row.created_at).toISOString(),
        expiresAt: expiresAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw new StorageError(error);
    }
  }

  async issueReadDeleteToken(id, tokenHash) {
    const sql = await this.ensureConnection();
    try {
      await sql`UPDATE ${sql.identifier(this.tablePath)} SET read_delete_token_hash = ${tokenHash} WHERE id = ${id}`;
      return true;
    } catch (error) {
      throw new StorageError(error);
    }
  }

  async deleteByToken(id, tokenHash, mode) {
    const sql = await this.ensureConnection();
    const column = mode === 'owner' ? 'owner_delete_token_hash' : 'read_delete_token_hash';
    try {
      const [rows] = await sql`
        SELECT id FROM ${sql.identifier(this.tablePath)}
        WHERE id = ${id} AND ${sql.identifier(column)} = ${tokenHash}
      `;
      if (!rows?.length) return false;
      await sql`DELETE FROM ${sql.identifier(this.tablePath)} WHERE id = ${id} AND ${sql.identifier(column)} = ${tokenHash}`;
      return true;
    } catch (error) {
      throw new StorageError(error);
    }
  }
}

export function createRepository() {
  return process.env.STORAGE === 'memory' || process.env.NODE_ENV === 'test' ? new MemoryRepository() : new YdbRepository();
}
