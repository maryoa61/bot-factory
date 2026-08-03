"""Custom bot core: owner gate, panel, feature wiring."""

from aiogram import Bot, F, Router
from aiogram.filters import Command, CommandStart
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from . import db
from .features import autoreply, broadcast, forward, groupadmin, joiner, poll, shop

PANEL = "panel"


def build_router(tenant_id: int, token: str) -> Router:
    router = Router(name=f"tenant-{tenant_id}")

    # feature routers (each no-ops when its feature is disabled in config)
    router.include_router(autoreply.build_router(tenant_id))
    router.include_router(shop.build_router(tenant_id))
    router.include_router(joiner.build_router(tenant_id))
    router.include_router(groupadmin.build_router(tenant_id))
    router.include_router(broadcast.build_router(tenant_id))
    router.include_router(poll.build_router(tenant_id))
    router.include_router(forward.build_router(tenant_id))

    @router.message(CommandStart())
    async def on_start(message: Message):
        cfg = await db.get_config(tenant_id)
        if message.from_user.id not in cfg["seen_users"]:
            cfg["seen_users"].append(message.from_user.id)
            await db.save_config(tenant_id, cfg)

        if await _is_owner(tenant_id, message.from_user.id):
            await message.answer(
                "👋 به پنل مدیریت رباتت خوش اومدی!\n"
                "از /panel برو به تنظیمات.",
                reply_markup=_panel_kb(),
            )
        else:
            await message.answer("سلام! 👋")

    @router.message(Command("panel"))
    async def on_panel(message: Message):
        if not await _is_owner(tenant_id, message.from_user.id):
            return
        cfg = await db.get_config(tenant_id)
        await message.answer("🎛 پنل مدیریت:", reply_markup=_panel_kb(cfg))

    @router.callback_query(F.data == f"{PANEL}:stats")
    async def cb_stats(callback: CallbackQuery):
        if not await _is_owner(tenant_id, callback.from_user.id):
            return await callback.answer("دسترسی نداری", show_alert=True)
        cfg = await db.get_config(tenant_id)
        tenant = await db.get_tenant(tenant_id)
        await callback.answer()
        await callback.message.answer(
            f"📊 وضعیت ربات\n"
            f"• کاربران دیده‌شده: {len(cfg['seen_users'])}\n"
            f"• پاسخ‌های خودکار: {len(cfg['autoreplies'])}\n"
            f"• محصولات: {len(cfg['products'])}\n"
            f"• گیت عضویت: {'فعال' if cfg['join_channel'] else 'غیرفعال'}\n"
            f"• ضدلینک: {'فعال' if cfg['antilink'] else 'غیرفعال'}\n"
            f"• وضعیت: {'✅ فعال' if tenant and tenant['active'] else '❌ غیرفعال'}",
        )

    @router.callback_query(F.data.in_({"ar:menu", "sh:menu", "jn:menu", "ga:menu"}))
    async def cb_feature_menu(callback: CallbackQuery):
        if not await _is_owner(tenant_id, callback.from_user.id):
            return await callback.answer("دسترسی نداری", show_alert=True)
        help_texts = {
            "ar:menu": (
                "🗣 پاسخ خودکار\n"
                "/addreply کلمه|جواب\n"
                "/listreply\n"
                "/delreply <شماره>\n"
                "/setdefault متن پیش‌فرض"
            ),
            "sh:menu": (
                "🛒 فروشگاه\n"
                "/addproduct نام|ستاره|توضیح\n"
                "/listproducts\n"
                "/delproduct <شماره>\n\n"
                "کاربرها با دستور /shop خرید می‌کنن و با ⭐ ستاره‌ی تلگرام پرداخت می‌شه."
            ),
            "jn:menu": (
                "🔗 گیت عضویت\n"
                "/setjoin @کانال\n"
                "/removejoin\n"
                "/joinstatus"
            ),
            "ga:menu": (
                "🛡 مدیریت گروه\n"
                "/kick /ban /unban /mute /unmute (ریپلای روی پیام یا آیدی)\n"
                "/antilink on|off\n"
                "/setwelcome متن (با {name})"
            ),
        }
        await callback.answer()
        await callback.message.answer(help_texts.get(callback.data, "?"))

    # ---- joiner gate for non-owners ----
    @router.message(F.chat.type == "private")
    async def gate_and_reply(message: Message):
        user = message.from_user
        if await _is_owner(tenant_id, user.id):
            return  # owner commands are handled by specific handlers

        cfg = await db.get_config(tenant_id)
        if user.id not in cfg["seen_users"]:
            cfg["seen_users"].append(user.id)
            await db.save_config(tenant_id, cfg)

        if not await joiner.passes_gate(tenant_id, cfg, message.bot, user.id):
            return  # joiner feature already answered

        await autoreply.handle_private_message(tenant_id, cfg, message)

    return router


async def _is_owner(tenant_id: int, user_id: int) -> bool:
    tenant = await db.get_tenant(tenant_id)
    return bool(tenant and tenant["owner_id"] == user_id)


def _panel_kb(cfg: dict) -> InlineKeyboardMarkup:
    f = cfg["features"]
    rows = []
    if f.get("autoreply"):
        rows.append([InlineKeyboardButton(text="🗣 پاسخ خودکار", callback_data="ar:menu")])
    if f.get("shop"):
        rows.append([InlineKeyboardButton(text="🛒 فروشگاه", callback_data="sh:menu")])
    if f.get("joiner"):
        rows.append([InlineKeyboardButton(text="🔗 گیت عضویت", callback_data="jn:menu")])
    if f.get("groupadmin") or f.get("antispam") or f.get("welcome"):
        rows.append([InlineKeyboardButton(text="🛡 مدیریت گروه", callback_data="ga:menu")])
    rows.append([InlineKeyboardButton(text="📊 وضعیت", callback_data=f"{PANEL}:stats")])
    return InlineKeyboardMarkup(inline_keyboard=rows)
