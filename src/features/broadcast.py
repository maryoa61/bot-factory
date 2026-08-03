"""Broadcast feature: owner sends a message to every user who started the bot."""

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import Message

from .. import db


def build_router(tenant_id: int) -> Router:
    router = Router(name=f"bc-{tenant_id}")

    @router.message(Command("broadcast"))
    async def broadcast(message: Message):
        t = await db.get_tenant(tenant_id)
        if not t or t["owner_id"] != message.from_user.id:
            return
        cfg = await db.get_config(tenant_id)
        if not cfg["features"].get("broadcast"):
            return await message.answer("ربات تو این قابلیت رو نداره.")
        text = message.text.replace("/broadcast", "", 1).strip()
        if not text:
            return await message.answer("مثال: /broadcast سلام به همه! 🎉")
        users = list(cfg.get("seen_users", []))
        ok, fail = 0, 0
        for uid in users:
            try:
                await message.bot.send_message(uid, text)
                ok += 1
            except Exception:
                fail += 1
        await message.answer(f"📣 ارسال شد.\nموفق: {ok}\nناموفق (بلاک/استاپ شده): {fail}\nاز {len(users)} کاربر")

    return router
