import { readFile } from 'node:fs/promises';
import { Driver } from '@ydbjs/core';
import { EnvironCredentialsProvider } from '@ydbjs/auth/environ';
import { query } from '@ydbjs/query';

const connectionString = process.env.YDB_CONNECTION_STRING;
if (!connectionString) throw new Error('YDB_CONNECTION_STRING is required');
const schema = await readFile(new URL('../infra/ydb/schema.sql', import.meta.url), 'utf8');
const credentialsProvider = new EnvironCredentialsProvider(connectionString);
const driver = new Driver(connectionString, { credentialsProvider, secureOptions: credentialsProvider.secureOptions });
try {
  await driver.ready();
  const sql = query(driver);
  await sql(schema);
  console.log('YDB schema applied or already exists');
} finally {
  driver.close();
}
