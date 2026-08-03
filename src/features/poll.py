"""Poll feature: owner creates a poll with a simple command."""

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import Message

from .. import db


def build_router(tenant_id: int) -> Router:
    router = Router(name=f"pl-{tenant_id}")

    @router.message(Command("poll"))
    async def create_poll(message: Message):
        t = await db.get_tenant(tenant_id)
        if not t or t["owner_id"] != message.from_user.id:
            return
        cfg = await db.get_config(tenant_id)
        if not cfg["features"].get("poll"):
            return await message.answer("ربات تو این قابلیت رو نداره.")
        parts = [p.strip() for p in message.text.replace("/poll", "", 1).split("|") if p.strip()]
        if len(parts) < 3:
            return await message.answer("مثال: /poll سوال|گزینه۱|گزینه۲|گزینه۳")
        if len(parts) > 11:
            return await message.answer("حداکثر ۱۰ گزینه.")
        await message.answer_poll(question=parts[0], options=parts[1:], is_anonymous=False)

    return router
