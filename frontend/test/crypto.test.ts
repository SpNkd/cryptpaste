import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptText, encryptText, MAX_PLAINTEXT_BYTES } from '../src/crypto';

test('round trips Unicode, emoji, newlines and special characters', async () => {
  const plaintext = 'Привет, мир! 👋\nline 2\n<>&"\' / \\';
  const envelope = await encryptText(plaintext, 'correct horse battery staple');
  assert.equal(await decryptText(envelope, 'correct horse battery staple'), plaintext);
});

test('wrong password and changed ciphertext fail authentication', async () => {
  const envelope = await encryptText('secret', 'password-123');
  await assert.rejects(() => decryptText(envelope, 'password-124'));
  const changed = { ...envelope, ciphertext: `${envelope.ciphertext.startsWith('A') ? 'B' : 'A'}${envelope.ciphertext.slice(1)}` };
  await assert.rejects(() => decryptText(changed, 'password-123'));
});

test('every encryption gets a new salt and IV', async () => {
  const first = await encryptText('same', 'password-123');
  const second = await encryptText('same', 'password-123');
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.iv, second.iv);
});

test('rejects plaintext over 32 KiB', async () => {
  await assert.rejects(() => encryptText('x'.repeat(MAX_PLAINTEXT_BYTES + 1), 'password-123'), /text-too-large/);
});
