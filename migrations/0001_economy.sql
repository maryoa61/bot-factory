-- Economy: points / wallet / levels for tenant bots (per-bot scoped)
CREATE TABLE IF NOT EXISTS users (
  bot_id   TEXT NOT NULL,          -- tenant bot token hash / id (which bot)
  user_id  INTEGER NOT NULL,       -- telegram user id
  balance  INTEGER NOT NULL DEFAULT 0,   -- spendable points
  level    INTEGER NOT NULL DEFAULT 1,   -- level (earned via messages/activity)
  xp       INTEGER NOT NULL DEFAULT 0,   -- xp towards next level
  last_daily TEXT,                 -- date string (YYYY-MM-DD) of last /daily claim
  created  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated  INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (bot_id, user_id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id    TEXT NOT NULL,
  user_id   INTEGER NOT NULL,
  type      TEXT NOT NULL,         -- daily | transfer_in | transfer_out | give | spend | earn
  amount    INTEGER NOT NULL,
  note      TEXT,
  ts        INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_tx_bot_user ON transactions (bot_id, user_id, ts);
CREATE INDEX IF NOT EXISTS idx_tx_bot ON transactions (bot_id, ts);
