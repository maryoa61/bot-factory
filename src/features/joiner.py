"""Joiner feature: force membership of a channel before using the bot."""

from aiogram import Bot, F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from .. import db


async def passes_gate(tenant_id: int, cfg: dict, bot: Bot, user_id: int) -> bool:
    """Return True if the user may use the bot (no gate, or already member)."""
    channel = cfg.get("join_channel", "")
    if not channel:
        return True
    if not cfg["features"].get("joiner"):
        return True
    try:
        member = await bot.get_chat_member(channel, user_id)
        if member.status in ("member", "administrator", "creator"):
            return True
    except Exception:
        pass
    # not a member -> prompt to join
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🔗 عضویت در کانال", url=f"https://t.me/{channel.lstrip('@')}")],
            [InlineKeyboardButton(text="✅ عضو شدم", callback_data="jn:check")],
        ]
    )
    await bot.send_message(user_id, f"برای استفاده از این ربات، اول عضو {channel} شو:", reply_markup=kb)
    return False


def build_router(tenant_id: int) -> Router:
    router = Router(name=f"jn-{tenant_id}")

    async def owner(message: Message) -> bool:
        t = await db.get_tenant(tenant_id)
        return bool(t and t["owner_id"] == message.from_user.id)

    @router.message(Command("setjoin"))
    async def set_join(message: Message):
        if not await owner(message):
            return
        cfg = await db.get_config(tenant_id)
        if not cfg["features"].get("joiner"):
            return await message.answer("ربات تو این قابلیت رو نداره.")
        ch = message.text.replace("/setjoin", "", 1).strip().lstrip("@")
        if not ch:
            return await message.answer("مثال: /setjoin mychannel")
        cfg["join_channel"] = ch
        await db.save_config(tenant_id, cfg)
        await message.answer(
            f"✅ گیت عضویت روی @{ch} تنظیم شد.\n"
            "نکته: ربات باید ادمینِ اون کانال باشه (حق «بررسی عضویت»)."
        )

    @router.message(Command("removejoin"))
    async def remove_join(message: Message):
        if not await owner(message):
            return
        cfg = await db.get_config(tenant_id)
        cfg["join_channel"] = ""
        await db.save_config(tenant_id, cfg)
        await message.answer("✅ گیت عضویت غیرفعال شد.")

    @router.message(Command("joinstatus"))
    async def join_status(message: Message):
        if not await owner(message):
            return
        cfg = await db.get_config(tenant_id)
        await message.answer(
            f"گیت عضویت: {'✅ @' + cfg['join_channel'] if cfg.get('join_channel') else '❌ غیرفعال'}"
        )

    @router.callback_query(F.data == "jn:check")
    async def check_join(callback: CallbackQuery):
        cfg = await db.get_config(tenant_id)
        channel = cfg.get("join_channel", "")
        try:
            member = await callback.message.bot.get_chat_member(channel, callback.from_user.id)
            if member.status in ("member", "administrator", "creator"):
                await callback.answer("✅ ممنون! حالا می‌تونی استفاده کنی.")
                await callback.message.answer("✅ عضویت تأیید شد. حالا می‌تونی از ربات استفاده کنی.")
                return
        except Exception:
            pass
        await callback.answer("هنوز عضوت نیستی!", show_alert=True)

    return router
