CREATE TABLE IF NOT EXISTS accounts (
  discord_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  display_tag TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 1000,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (discord_id) REFERENCES accounts(discord_id)
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  player1_id TEXT NOT NULL,
  player2_id TEXT NOT NULL,
  race_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  host_id TEXT,
  matched_at INTEGER NOT NULL,
  reserved_at INTEGER,
  expires_at INTEGER NOT NULL
);
