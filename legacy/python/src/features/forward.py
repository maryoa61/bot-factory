"""Forward feature: auto-forward channel posts from source to destination."""

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import Message

from .. import db


def build_router(tenant_id: int) -> Router:
    router = Router(name=f"fw-{tenant_id}")

    @router.message(Command("setforward"))
    async def set_forward(message: Message):
        t = await db.get_tenant(tenant_id)
        if not t or t["owner_id"] != message.from_user.id:
            return
        cfg = await db.get_config(tenant_id)
        if not cfg["features"].get("forward"):
            return await message.answer("ربات تو این قابلیت رو نداره.")
        parts = message.text.replace("/setforward", "", 1).split("|")
        if len(parts) < 2:
            return await message.answer("مثال: /setforward @مبدا|@مقصد")
        src = parts[0].strip().lstrip("@")
        dst = parts[1].strip().lstrip("@")
        if not src or not dst:
            return await message.answer("مثال: /setforward @مبدا|@مقصد")
        try:
            src_chat = await message.bot.get_chat(f"@{src}")
            dst_chat = await message.bot.get_chat(f"@{dst}")
            cfg["forward_src"] = src_chat.id
            cfg["forward_dst"] = dst_chat.id
            await db.save_config(tenant_id, cfg)
            await message.answer(f"✅ فوروارد از @{src} به @{dst} فعال شد.")
        except Exception as e:
            await message.answer(f"خطا: {e}\nمطمئن شو ربات توی هر دو ادمینه.")

    @router.message(Command("removeforward"))
    async def remove_forward(message: Message):
        t = await db.get_tenant(tenant_id)
        if not t or t["owner_id"] != message.from_user.id:
            return
        cfg = await db.get_config(tenant_id)
        cfg.pop("forward_src", None)
        cfg.pop("forward_dst", None)
        await db.save_config(tenant_id, cfg)
        await message.answer("✅ فوروارد غیرفعال شد.")

    # channel posts from the source channel get forwarded
    @router.channel_post()
    async def relay(post: Message):
        cfg = await db.get_config(tenant_id)
        src = cfg.get("forward_src")
        dst = cfg.get("forward_dst")
        if not src or not dst:
            return
        if post.chat.id != src:
            return
        try:
            await post.forward(dst)
        except Exception:
            pass

    return router
