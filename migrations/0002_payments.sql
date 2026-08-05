-- Payments infrastructure: supports BOTH Telegram Stars (XTR) and card-to-card (bank transfer)
-- This is schema-only; no bot code uses it yet.

-- Orders: a user buys a service/product, pays via stars OR card, admin confirms card payments.
CREATE TABLE IF NOT EXISTS orders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id     TEXT NOT NULL,             -- which tenant bot
  user_id    INTEGER NOT NULL,          -- buyer
  item       TEXT NOT NULL,             -- what they bought (product name / service)
  amount     INTEGER NOT NULL,          -- price (in stars OR toman, depending on method)
  currency   TEXT NOT NULL DEFAULT 'XTR',  -- XTR (stars) | TOMAN (card-to-card)
  method     TEXT NOT NULL,             -- stars | card
  status     TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | cancelled | refunded
  receipt_photo_id TEXT,                -- for card: telegram file_id of the payment screenshot
  card_number TEXT,                     -- for card: target card shown to user (snapshot at order time)
  note       TEXT,
  created    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_orders_bot_status ON orders (bot_id, status, created);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders (user_id, created);

-- Alias/settings per bot for payment config (card number, stars price list, etc.)
CREATE TABLE IF NOT EXISTS pay_settings (
  bot_id       TEXT PRIMARY KEY,
  card_number  TEXT,                    -- admin card for card-to-card
  card_holder  TEXT,                    -- account holder name
  stars_enabled INTEGER NOT NULL DEFAULT 1,
  card_enabled INTEGER NOT NULL DEFAULT 0,
  updated      INTEGER NOT NULL DEFAULT (unixepoch())
);
