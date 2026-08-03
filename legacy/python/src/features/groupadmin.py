"""Group admin feature: kick/ban/mute, anti-link, welcome message, bad words."""

import re

from aiogram import Bot, F, Router
from aiogram.filters import Command, ChatMemberUpdatedFilter, IS_MEMBER, IS_NOT_MEMBER
from aiogram.types import ChatMemberUpdated, ChatPermissions, Message

from .. import db

LINK_RE = re.compile(r"(https?://|t\.me/|www\.)", re.IGNORECASE)
BAD_WORDS = ["کص", "کیر", "کون", "جنده", "فحش"]


def build_router(tenant_id: int) -> Router:
    router = Router(name=f"ga-{tenant_id}")

    async def owner(message: Message) -> bool:
        t = await db.get_tenant(tenant_id)
        return bool(t and t["owner_id"] == message.from_user.id)

    async def is_admin(bot: Bot, chat_id: int, user_id: int) -> bool:
        try:
            member = await bot.get_chat_member(chat_id, user_id)
            return member.status in ("administrator", "creator")
        except Exception:
            return False

    async def target_user(message: Message) -> int | None:
        if message.reply_to_message:
            return message.reply_to_message.from_user.id if message.reply_to_message.from_user else None
        parts = message.text.split()
        if len(parts) >= 2 and parts[1].lstrip("@").isdigit():
            return int(parts[1].lstrip("@"))
        return None

    # ---- moderation commands (owner only) ----

    @router.message(Command("kick"))
    async def cmd_kick(message: Message):
        if not await owner(message):
            return
        uid = await target_user(message)
        if not uid:
            return await message.answer("روی پیام کسی ریپلای کن یا آیدی بده. مثال: /kick 12345")
        try:
            await message.chat.ban_chat_member(uid)
            await message.chat.unban_chat_member(uid)
            await message.answer("👢 کیک شد.")
        except Exception as e:
            await message.answer(f"خطا: {e}")

    @router.message(Command("ban"))
    async def cmd_ban(message: Message):
        if not await owner(message):
            return
        uid = await target_user(message)
        if not uid:
            return await message.answer("روی پیام کسی ریپلای کن یا آیدی بده. مثال: /ban 12345")
        try:
            await message.chat.ban_chat_member(uid)
            await message.answer("⛔️ بن شد.")
        except Exception as e:
            await message.answer(f"خطا: {e}")

    @router.message(Command("unban"))
    async def cmd_unban(message: Message):
        if not await owner(message):
            return
        uid = await target_user(message)
        if not uid:
            return await message.answer("مثال: /unban 12345")
        try:
            await message.chat.unban_chat_member(uid)
            await message.answer("✅ آنبن شد.")
        except Exception as e:
            await message.answer(f"خطا: {e}")

    @router.message(Command("mute"))
    async def cmd_mute(message: Message):
        if not await owner(message):
            return
        uid = await target_user(message)
        if not uid:
            return await message.answer("روی پیام کسی ریپلای کن یا آیدی بده. مثال: /mute 12345")
        try:
            await message.chat.restrict_chat_member(uid, ChatPermissions(can_send_messages=False))
            await message.answer("🔇 میوت شد.")
        except Exception as e:
            await message.answer(f"خطا: {e}")

    @router.message(Command("unmute"))
    async def cmd_unmute(message: Message):
        if not await owner(message):
            return
        uid = await target_user(message)
        if not uid:
            return await message.answer("مثال: /unmute 12345")
        try:
            await message.chat.restrict_chat_member(
                uid,
                ChatPermissions(
                    can_send_messages=True,
                    can_send_media_messages=True,
                    can_send_other_messages=True,
                    can_add_web_page_previews=True,
                ),
            )
            await message.answer("✅ آنمیوت شد.")
        except Exception as e:
            await message.answer(f"خطا: {e}")

    @router.message(Command("antilink"))
    async def cmd_antilink(message: Message):
        if not await owner(message):
            return
        cfg = await db.get_config(tenant_id)
        if not cfg["features"].get("antispam") and not cfg["features"].get("groupadmin"):
            return await message.answer("ربات تو این قابلیت رو نداره.")
        arg = message.text.replace("/antilink", "", 1).strip().lower()
        if arg not in ("on", "off"):
            return await message.answer("مثال: /antilink on یا /antilink off")
        cfg["antilink"] = arg == "on"
        await db.save_config(tenant_id, cfg)
        await message.answer(f"ضدلینک: {'✅ فعال' if cfg['antilink'] else '❌ غیرفعال'}")

    @router.message(Command("setwelcome"))
    async def cmd_setwelcome(message: Message):
        if not await owner(message):
            return
        cfg = await db.get_config(tenant_id)
        if not cfg["features"].get("welcome") and not cfg["features"].get("groupadmin"):
            return await message.answer("ربات تو این قابلیت رو نداره.")
        text = message.text.replace("/setwelcome", "", 1).strip()
        if not text:
            return await message.answer("مثال: /setwelcome خوش اومدی {name} عزیز! 🎉")
        cfg["welcome_msg"] = text
        await db.save_config(tenant_id, cfg)
        await message.answer("✅ پیام خوش‌آمد ذخیره شد. از {name} برای اسم کاربر استفاده کن.")

    @router.message(Command("welcome"))
    async def cmd_welcome_preview(message: Message):
        if not await owner(message):
            return
        cfg = await db.get_config(tenant_id)
        await message.answer(
            (cfg.get("welcome_msg") or "خوش اومدی {name}!").replace("{name}", message.from_user.first_name or "")
        )

    # ---- automatic group protection ----

    @router.message(F.chat.type.in_({"group", "supergroup"}), F.text)
    async def group_policer(message: Message):
        # skip owner and admins
        if await owner(message) or await is_admin(message.bot, message.chat.id, message.from_user.id):
            return
        cfg = await db.get_config(tenant_id)
        can_act = cfg["features"].get("antispam") or cfg["features"].get("groupadmin")

        # anti-link
        if can_act and cfg.get("antilink") and LINK_RE.search(message.text or ""):
            try:
                await message.delete()
                await message.answer(f"⚠️ {message.from_user.first_name}، لینک در این گروه ممنوعه!", disable_notification=True)
            except Exception:
                pass
            return

        # bad words
        if can_act and cfg.get("antispam"):
            for w in BAD_WORDS:
                if w in (message.text or "").lower():
                    try:
                        await message.delete()
                    except Exception:
                        pass
                    return

    @router.chat_member(ChatMemberUpdatedFilter(member_status_changed=(IS_NOT_MEMBER, IS_MEMBER)))
    async def on_new_member(event: ChatMemberUpdated):
        if event.new_chat_member.status != "member":
            return
        cfg = await db.get_config(tenant_id)
        if not (cfg.get("welcome_msg") or "").strip():
            return
        if not (cfg["features"].get("welcome") or cfg["features"].get("groupadmin")):
            return
        name = event.new_chat_member.user.first_name or "دوست عزیز"
        try:
            await event.answer(cfg["welcome_msg"].replace("{name}", name))
        except Exception:
            pass

    return router
