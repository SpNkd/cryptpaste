import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryRepository } from '../src/repository.mjs';

test('memory repository expires records and rejects wrong delete token', async () => {
  let now = Date.now();
  const repository = new MemoryRepository(() => now);
  await repository.insert({ id: 'abcdefghijklmnop', expiresAt: new Date(now + 1_000).toISOString(), ownerDeleteTokenHash: 'owner', readDeleteTokenHash: null });
  assert.ok(await repository.get('abcdefghijklmnop'));
  assert.equal(await repository.deleteByToken('abcdefghijklmnop', 'wrong', 'owner'), false);
  now += 2_000;
  assert.equal(await repository.get('abcdefghijklmnop'), null);
});
