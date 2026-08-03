/** KV registry: tenants + pending factory conversations + users (for broadcast).
 *  Replaces the D1 tables — KV needs no schema, no migrations. */

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

// ---------- helpers ----------

function randomId(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

async function listKeys(kv: KVNamespace, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix, limit: 1000, cursor });
    keys.push(...page.keys.map((k) => k.name));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return keys;
}

function parseRow<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ---------- tenants ----------

export async function addTenant(
  kv: KVNamespace,
  t: { owner_id: number; token: string; username: string; name: string; template: string; config: string; hook_secret: string }
): Promise<number> {
  let id = randomId();
  while (await kv.get(`tid:${id}`)) id = randomId();
  const row: TenantRow = {
    id,
    owner_id: t.owner_id,
    token: t.token,
    username: t.username,
    name: t.name,
    template: t.template,
    config: t.config,
    active: 1,
    hook_secret: t.hook_secret,
  };
  await kv.put(`tenant:${t.token}`, JSON.stringify(row));
  await kv.put(`tid:${id}`, t.token);
  return id;
}

export async function getTenantByToken(kv: KVNamespace, token: string): Promise<TenantRow | null> {
  return parseRow<TenantRow>(await kv.get(`tenant:${token}`));
}

export async function getTenantById(kv: KVNamespace, id: number): Promise<TenantRow | null> {
  const token = await kv.get(`tid:${id}`);
  return token ? getTenantByToken(kv, token) : null;
}

export async function listByOwner(kv: KVNamespace, ownerId: number): Promise<TenantRow[]> {
  const keys = await listKeys(kv, "tenant:");
  const rows: TenantRow[] = [];
  for (const key of keys) {
    const row = parseRow<TenantRow>(await kv.get(key));
    if (row && row.owner_id === ownerId) rows.push(row);
  }
  rows.sort((a, b) => a.id - b.id);
  return rows;
}

export async function deleteTenant(kv: KVNamespace, id: number): Promise<void> {
  const tenant = await getTenantById(kv, id);
  if (!tenant) return;
  await kv.delete(`tenant:${tenant.token}`);
  await kv.delete(`tid:${id}`);
  const userKeys = await listKeys(kv, `u:${id}:`);
  for (const key of userKeys) await kv.delete(key);
}

export async function setConfig(kv: KVNamespace, id: number, config: unknown): Promise<void> {
  const tenant = await getTenantById(kv, id);
  if (!tenant) return;
  tenant.config = JSON.stringify(config);
  await kv.put(`tenant:${tenant.token}`, JSON.stringify(tenant));
}

// ---------- users (collected for broadcast) ----------

export async function addUser(kv: KVNamespace, tenantId: number, userId: number): Promise<void> {
  await kv.put(`u:${tenantId}:${userId}`, "1");
}

export async function listUsers(kv: KVNamespace, tenantId: number): Promise<number[]> {
  const keys = await listKeys(kv, `u:${tenantId}:`);
  return keys.map((k) => Number(k.split(":").pop())).filter((n) => Number.isFinite(n));
}

// ---------- pending factory conversations ----------

export async function getPending(kv: KVNamespace, userId: number): Promise<PendingRow | null> {
  return parseRow<PendingRow>(await kv.get(`pending:${userId}`));
}

export async function savePending(
  kv: KVNamespace,
  userId: number,
  p: Partial<Omit<PendingRow, "user_id">>
): Promise<void> {
  const cur = await getPending(kv, userId);
  const next: PendingRow = {
    user_id: userId,
    step: p.step ?? cur?.step ?? "request",
    template: p.template !== undefined ? p.template : cur?.template ?? null,
    token: p.token !== undefined ? p.token : cur?.token ?? null,
    username: p.username !== undefined ? p.username : cur?.username ?? null,
    name: p.name !== undefined ? p.name : cur?.name ?? null,
    owner: p.owner !== undefined ? p.owner : cur?.owner ?? null,
  };
  await kv.put(`pending:${userId}`, JSON.stringify(next));
}

export async function clearPending(kv: KVNamespace, userId: number): Promise<void> {
  await kv.delete(`pending:${userId}`);
}
