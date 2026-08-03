"""Auto-reply feature: keyword -> response pairs, default reply, /info card."""

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import Message

from .. import db


async def handle_private_message(tenant_id: int, cfg: dict, message: Message) -> None:
    """Called from the core gate for every private message from a non-owner."""
    if not cfg["features"].get("autoreply"):
        return
    text = (message.text or "").strip()
    if not text:
        return
    lower = text.lower()
    for pair in cfg["autoreplies"]:
        kw = (pair.get("kw") or "").lower()
        if kw and kw in lower:
            await message.answer(pair.get("reply", ""))
            return
    if cfg.get("default_reply"):
        await message.answer(cfg["default_reply"])


def build_router(tenant_id: int) -> Router:
    router = Router(name=f"ar-{tenant_id}")

    async def owner(message: Message) -> bool:
        t = await db.get_tenant(tenant_id)
        return bool(t and t["owner_id"] == message.from_user.id)

    @router.message(Command("addreply"))
    async def add_reply(message: Message):
        if not await owner(message):
            return
        cfg = await db.get_config(tenant_id)
        if not cfg["features"].get("autoreply"):
            return await message.answer("ربات تو این قابلیت رو نداره.")
        parts = message.text.split("|", 1)
        if len(parts) < 2 or not parts[1].strip():
            return await message.answer("مثال: /addreply سلام|سلام عزیز، چطور می‌تونم کمک کنم؟")
        cfg["autoreplies"].append({"kw": parts[0].replace("/addreply", "").strip(), "reply": parts[1].strip()})
        await db.save_config(tenant_id, cfg)
        await message.answer(f"✅ اضافه شد. حالا {len(cfg['autoreplies'])} پاسخ داری.")

    @router.message(Command("listreply"))
    async def list_reply(message: Message):
        if not await owner(message):
            return
        cfg = await db.get_config(tenant_id)
        if not cfg["autoreplies"]:
            return await message.answer("هنوز پاسخی نداری. /addreply کلمه|جواب")
        lines = [f"{i}. «{p['kw']}» → {p['reply'][:40]}" for i, p in enumerate(cfg["autoreplies"], 1)]
        await message.answer("\n".join(lines) + "\n\nحذف: /delreply <شماره>")

    @router.message(Command("delreply"))
    async def del_reply(message: Message):
        if not await owner(message):
            return
        cfg = await db.get_config(tenant_id)
        parts = message.text.split()
        if len(parts) != 2 or not parts[1].isdigit():
            return await message.answer("مثال: /delreply 2")
        idx = int(parts[1]) - 1
        if 0 <= idx < len(cfg["autoreplies"]):
            cfg["autoreplies"].pop(idx)
            await db.save_config(tenant_id, cfg)
            await message.answer("✅ حذف شد.")
        else:
            await message.answer("شماره‌ی نامعتبر.")

    @router.message(Command("setdefault"))
    async def set_default(message: Message):
        if not await owner(message):
            return
        cfg = await db.get_config(tenant_id)
        text = message.text.replace("/setdefault", "", 1).strip()
        if not text:
            return await message.answer("مثال: /setdefault سلام! چطور می‌تونم کمکت کنم؟")
        cfg["default_reply"] = text
        await db.save_config(tenant_id, cfg)
        await message.answer("✅ پاسخ پیش‌فرض ذخیره شد.")

    @router.message(Command("setinfo"))
    async def set_info(message: Message):
        # alias for card templates
        if not await owner(message):
            return
        cfg = await db.get_config(tenant_id)
        text = message.text.replace("/setinfo", "", 1).strip()
        if not text:
            return await message.answer("مثال: /setinfo من یه طراح وب هستم...")
        cfg["default_reply"] = text
        await db.save_config(tenant_id, cfg)
        await message.answer("✅ اطلاعات معرفی ذخیره شد.")

    @router.message(Command("info"))
    async def show_info(message: Message):
        cfg = await db.get_config(tenant_id)
        if cfg.get("default_reply"):
            await message.answer(cfg["default_reply"])

    return router
