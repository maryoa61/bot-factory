CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  username TEXT,
  name TEXT,
  template TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1,
  hook_secret TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  UNIQUE(tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS pending (
  user_id INTEGER PRIMARY KEY,
  step TEXT NOT NULL DEFAULT 'request',
  template TEXT,
  token TEXT,
  username TEXT,
  name TEXT,
  owner INTEGER
);
