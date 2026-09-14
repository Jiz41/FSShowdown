CREATE TABLE IF NOT EXISTS ratings (
  discord_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 1000,
  PRIMARY KEY (discord_id, platform)
);
