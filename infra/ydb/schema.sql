-- Run once against the target YDB database.
-- The table stores encrypted envelopes and deletion-token hashes only.
CREATE TABLE IF NOT EXISTS pastes (
  id Utf8,
  ciphertext Utf8,
  salt Utf8,
  iv Utf8,
  kdf Utf8,
  kdf_iterations Uint64,
  algorithm Utf8,
  version Uint32,
  owner_delete_token_hash Utf8,
  read_delete_token_hash Utf8,
  delete_after_read Bool,
  size_bytes Uint64,
  created_at Timestamp,
  expires_at Timestamp,
  PRIMARY KEY (id)
);
