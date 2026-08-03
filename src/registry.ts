/** D1 registry: tenants + pending factory conversations + users (for broadcast). */

export interface TenantRow {
  id: number;
  owner_id: number;
  token: string;
  username: string | null;
  name: string | null;
  template: string;
  config: string;
  active: number;
  hook_secret: string;
}

export interface PendingRow {
  user_id: number;
  step: string;
  template: string | null;
  token: string | null;
  username: string | null;
  name: string | null;
  owner: number | null;
}

export async function initDb(db: D1Database): Promise<void> {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS tenants (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       owner_id INTEGER NOT NULL,
       token TEXT NOT NULL UNIQUE,
       username TEXT,
       name TEXT,
       template TEXT NOT NULL,
       config TEXT NOT NULL DEFAULT '{}',
       active INTEGER NOT NULL DEFAULT 1,
       hook_secret TEXT NOT NULL DEFAULT ''
     )`
  );
  await db.exec(
    `CREATE TABLE IF NOT EXISTS users (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       tenant_id INTEGER NOT NULL,
       user_id INTEGER NOT NULL,
       UNIQUE(tenant_id, user_id)
     )`
  );
  await db.exec(
    `CREATE TABLE IF NOT EXISTS pending (
       user_id INTEGER PRIMARY KEY,
       step TEXT NOT NULL DEFAULT 'request',
       template TEXT,
       token TEXT,
       username TEXT,
       name TEXT,
       owner INTEGER
     )`
  );
}

// ---------- tenants ----------

export async function addTenant(
  db: D1Database,
  t: { owner_id: number; token: string; username: string; name: string; template: string; config: string; hook_secret: string }
): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO tenants (owner_id, token, username, name, template, config, hook_secret)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(t.owner_id, t.token, t.username, t.name, t.template, t.config, t.hook_secret)
    .run();
  return res.meta.last_row_id;
}

export async function getTenantByToken(db: D1Database, token: string): Promise<TenantRow | null> {
  return (await db.prepare(`SELECT * FROM tenants WHERE token = ?`).bind(token).first<TenantRow>()) ?? null;
}

export async function getTenantById(db: D1Database, id: number): Promise<TenantRow | null> {
  return (await db.prepare(`SELECT * FROM tenants WHERE id = ?`).bind(id).first<TenantRow>()) ?? null;
}

export async function listByOwner(db: D1Database, ownerId: number): Promise<TenantRow[]> {
  const res = await db.prepare(`SELECT * FROM tenants WHERE owner_id = ? ORDER BY id`).bind(ownerId).all<TenantRow>();
  return res.results ?? [];
}

export async function deleteTenant(db: D1Database, id: number): Promise<void> {
  await db.prepare(`DELETE FROM users WHERE tenant_id = ?`).bind(id).run();
  await db.prepare(`DELETE FROM tenants WHERE id = ?`).bind(id).run();
}

export async function setConfig(db: D1Database, id: number, config: unknown): Promise<void> {
  await db.prepare(`UPDATE tenants SET config = ? WHERE id = ?`).bind(JSON.stringify(config), id).run();
}

// ---------- users (collected for broadcast) ----------

export async function addUser(db: D1Database, tenantId: number, userId: number): Promise<void> {
  await db.prepare(`INSERT OR IGNORE INTO users (tenant_id, user_id) VALUES (?, ?)`).bind(tenantId, userId).run();
}

export async function listUsers(db: D1Database, tenantId: number): Promise<number[]> {
  const res = await db.prepare(`SELECT user_id FROM users WHERE tenant_id = ?`).bind(tenantId).all<{ user_id: number }>();
  return (res.results ?? []).map((r) => r.user_id);
}

// ---------- pending factory conversations ----------

export async function getPending(db: D1Database, userId: number): Promise<PendingRow | null> {
  return (await db.prepare(`SELECT * FROM pending WHERE user_id = ?`).bind(userId).first<PendingRow>()) ?? null;
}

export async function savePending(
  db: D1Database,
  userId: number,
  p: Partial<Omit<PendingRow, "user_id">>
): Promise<void> {
  const cur = await getPending(db, userId);
  const next: PendingRow = {
    user_id: userId,
    step: p.step ?? cur?.step ?? "request",
    template: p.template !== undefined ? p.template : cur?.template ?? null,
    token: p.token !== undefined ? p.token : cur?.token ?? null,
    username: p.username !== undefined ? p.username : cur?.username ?? null,
    name: p.name !== undefined ? p.name : cur?.name ?? null,
    owner: p.owner !== undefined ? p.owner : cur?.owner ?? null,
  };
  await db
    .prepare(
      `INSERT INTO pending (user_id, step, template, token, username, name, owner)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         step = excluded.step,
         template = excluded.template,
         token = excluded.token,
         username = excluded.username,
         name = excluded.name,
         owner = excluded.owner`
    )
    .bind(next.user_id, next.step, next.template, next.token, next.username, next.name, next.owner)
    .run();
}

export async function clearPending(db: D1Database, userId: number): Promise<void> {
  await db.prepare(`DELETE FROM pending WHERE user_id = ?`).bind(userId).run();
}
