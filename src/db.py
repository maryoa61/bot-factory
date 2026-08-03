"""SQLite layer (aiosqlite). One row per tenant bot, config kept as JSON."""

import asyncio
import json
import time
from typing import Any, Optional

import aiosqlite

from . import config

_default_config: dict = {
    "features": {"autoreply": True, "shop": True, "joiner": False, "groupadmin": True},
    "autoreplies": [],          # [{"kw": "hi", "reply": "hello"}, ...]
    "default_reply": "",        # fallback reply when nothing matches
    "products": [],             # [{"id": 1, "name": "...", "stars": 5, "desc": "..."}]
    "join_channel": "",         # "@channel" or id string; empty = gate off
    "welcome_msg": "",
    "antilink": False,
    "seen_users": [],           # all users who have chatted with this bot
}


def default_config() -> dict:
    return json.loads(json.dumps(_default_config))


_db: Optional[aiosqlite.Connection] = None


async def init_db() -> None:
    global _db
    import os
    os.makedirs(os.path.dirname(config.DATABASE_PATH) or ".", exist_ok=True)
    _db = await aiosqlite.connect(config.DATABASE_PATH)
    _db.row_factory = aiosqlite.Row
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS tenants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_id INTEGER NOT NULL,
            token TEXT NOT NULL UNIQUE,
            username TEXT NOT NULL,
            name TEXT NOT NULL,
            template TEXT NOT NULL DEFAULT '',
            config TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL
        )
        """
    )
    await _db.commit()


def db() -> aiosqlite.Connection:
    if _db is None:
        raise RuntimeError("db not initialized")
    return _db


# ---------- tenants ----------

async def add_tenant(owner_id: int, token: str, username: str, name: str, template: str, cfg: dict) -> Optional[int]:
    cur = await db().execute(
        "INSERT INTO tenants (owner_id, token, username, name, template, config, active, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
        (owner_id, token, username, name, template, json.dumps(cfg), int(time.time())),
    )
    await db().commit()
    return cur.lastrowid


async def tenant_exists(token: str) -> bool:
    cur = await db().execute("SELECT 1 FROM tenants WHERE token = ?", (token,))
    return await cur.fetchone() is not None


async def get_tenant(tenant_id: int) -> Optional[dict]:
    cur = await db().execute("SELECT * FROM tenants WHERE id = ?", (tenant_id,))
    row = await cur.fetchone()
    return dict(row) if row else None


async def get_tenant_by_token(token: str) -> Optional[dict]:
    cur = await db().execute("SELECT * FROM tenants WHERE token = ?", (token,))
    row = await cur.fetchone()
    return dict(row) if row else None


async def get_tenants_by_owner(owner_id: int) -> list[dict]:
    cur = await db().execute("SELECT * FROM tenants WHERE owner_id = ? ORDER BY id", (owner_id,))
    return [dict(r) for r in await cur.fetchall()]


async def get_all_tenants() -> list[dict]:
    cur = await db().execute("SELECT * FROM tenants ORDER BY id")
    return [dict(r) for r in await cur.fetchall()]


async def delete_tenant(tenant_id: int) -> None:
    await db().execute("DELETE FROM tenants WHERE id = ?", (tenant_id,))
    await db().commit()


async def set_active(tenant_id: int, active: bool) -> None:
    await db().execute("UPDATE tenants SET active = ? WHERE id = ?", (1 if active else 0, tenant_id))
    await db().commit()


# ---------- per-tenant config ----------

def _load_cfg(row: dict) -> dict:
    cfg = json.loads(row["config"])
    merged = default_config()
    for k, v in cfg.items():
        merged[k] = v
    return merged


async def get_config(tenant_id: int) -> dict:
    row = await get_tenant(tenant_id)
    if not row:
        return default_config()
    return _load_cfg(row)


async def get_config_by_token(token: str) -> dict:
    row = await get_tenant_by_token(token)
    if not row:
        return default_config()
    return _load_cfg(row)


async def save_config(tenant_id: int, cfg: dict) -> None:
    await db().execute("UPDATE tenants SET config = ? WHERE id = ?", (json.dumps(cfg), tenant_id))
    await db().commit()
