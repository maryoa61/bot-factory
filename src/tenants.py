"""Tenant runner: starts/stops one polling task per custom bot."""

import asyncio
import logging
from typing import Optional

from aiogram import Bot, Dispatcher

from . import db
from .tenant_bot import build_router

log = logging.getLogger("tenants")

_tasks: dict[int, asyncio.Task] = {}
_bots: dict[int, Bot] = {}


async def start_tenant(tenant_id: int) -> bool:
    if tenant_id in _tasks and not _tasks[tenant_id].done():
        return True

    tenant = await db.get_tenant(tenant_id)
    if not tenant:
        return False

    bot = Bot(token=tenant["token"], timeout=30)
    dp = Dispatcher()
    dp.include_router(build_router(tenant_id, tenant["token"]))

    async def run():
        try:
            log.info("starting tenant bot #%s @%s", tenant_id, tenant["username"])
            await dp.start_polling(bot, handle_signals=False)
        except Exception as e:
            log.error("tenant #%s died: %s", tenant_id, e)
            await db.set_active(tenant_id, False)
        finally:
            await bot.session.close()

    _tasks[tenant_id] = asyncio.create_task(run())
    _bots[tenant_id] = bot
    await db.set_active(tenant_id, True)
    return True


async def stop_tenant(tenant_id: int) -> None:
    task = _tasks.pop(tenant_id, None)
    if task:
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass
    bot = _bots.pop(tenant_id, None)
    if bot:
        try:
            await bot.session.close()
        except Exception:
            pass
    await db.set_active(tenant_id, False)


async def start_all() -> int:
    tenants = await db.get_all_tenants()
    started = 0
    for t in tenants:
        if t["active"]:
            if await start_tenant(t["id"]):
                started += 1
    log.info("started %d/%d tenant bots", started, len(tenants))
    return started


async def stop_all() -> None:
    for tid in list(_tasks.keys()):
        await stop_tenant(tid)
