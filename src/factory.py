"""Factory bot: user describes the bot they want -> token -> custom bot delivered."""

from aiogram import Bot, F, Router
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message

from . import config, db, templates
from .tenants import start_tenant, stop_tenant

router = Router(name="factory")


class NewBot(StatesGroup):
    waiting_request = State()
    waiting_token = State()
    waiting_owner = State()


@router.message(CommandStart())
async def on_start(message: Message):
    await message.answer(
        "سلام! 🤖 من کارخونه‌ی ربات‌سازم.\n\n"
        "بگو چه رباتی می‌خوای — مثلاً:\n"
        "«یه ربات فروشگاه می‌خوام»\n"
        "«ربات پاسخگوی خودکار»\n"
        "«ربات جوینر برای کانالم»\n"
        "«مدیریت گروه»\n\n"
        "الان از این ربات‌ها پشتیبانی می‌کنم:\n"
        + _templates_text()
        + "\n\nبزن /newbot تا شروع کنیم.",
        reply_markup=_panel(),
    )


def _templates_text() -> str:
    lines = []
    for i, t in enumerate(templates.TEMPLATES, 1):
        lines.append(f"{i}. {t.name} — {t.desc}")
    return "\n".join(lines)


def _panel() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🤖 ربات جدید", callback_data="factory:newbot")],
            [InlineKeyboardButton(text="📋 ربات‌های من", callback_data="factory:mybots")],
        ]
    )


@router.message(Command("newbot"))
async def on_newbot(message: Message, state: FSMContext):
    owned = await db.get_tenants_by_owner(message.from_user.id)
    if len(owned) >= config.MAX_BOTS_PER_USER:
        await message.answer(f"حداکثر {config.MAX_BOTS_PER_USER} ربات می‌تونی بسازی.")
        return
    await state.set_state(NewBot.waiting_request)
    await message.answer(
        "چه رباتی می‌خوای؟ 🔍\n"
        "درخواستت رو یه جمله بنویس، مثلاً:\n"
        "«یه ربات می‌خوام که به مشتری‌هام خودکار جواب بده»\n\n"
        "اگه مطمئن نیستی: /list بزن تا لیست ربات‌های آماده رو ببینی.",
    )


@router.message(Command("list"))
async def on_list(message: Message):
    await message.answer("ربات‌هایی که می‌تونم بسازم:\n\n" + _templates_text())


@router.message(NewBot.waiting_request, F.text)
async def got_request(message: Message, state: FSMContext):
    text = message.text.strip()
    tpl, score = templates.match_request(text)
    if tpl is None or score == 0:
        await message.answer(
            "نتونستم بفهمم چه رباتی می‌خوای 🤔\n"
            "یه توضیح ساده‌تر بده یا /list بزن و اسم یه ربات رو بنویس.",
        )
        return
    await state.update_data(template=tpl.id)
    await state.set_state(NewBot.waiting_token)
    await message.answer(
        f"فهمیدم! ✅ ربات «{tpl.name}»\n{tpl.desc}\n\n"
        f"📌 {tpl.setup_hint}\n\n"
        "حالا توکن رباتت رو بفرست.\n"
        "از @BotFather → /newbot → اسم ربات → توکن رو اینجا کپی کن.",
        reply_markup=_confirm_kb(tpl.id),
    )


def _confirm_kb(tpl_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="✅ درسته، بده توکن", callback_data=f"factory:token:{tpl_id}"),
                InlineKeyboardButton(text="↩️ عوض کن", callback_data="factory:newbot"),
            ]
        ]
    )


@router.callback_query(F.data.startswith("factory:token:"))
async def cb_confirm(callback, state: FSMContext):
    tpl_id = callback.data.split(":", 2)[2]
    await callback.answer()
    await state.update_data(template=tpl_id)
    await state.set_state(NewBot.waiting_token)
    await callback.message.answer("توکن رباتت رو بفرست:")


@router.message(NewBot.waiting_token, F.text)
async def got_token(message: Message, state: FSMContext):
    token = message.text.strip()
    if ":" not in token or len(token) < 20:
        await message.answer("این توکن معتبر به نظر نمی‌رسه. دوباره بفرست یا /cancel بزن.")
        return

    try:
        probe = Bot(token=token, timeout=15)
        me = await probe.get_me()
        await probe.session.close()
    except Exception as e:
        await message.answer(f"توکن رد شد: {e}\nدوباره بفرست یا /cancel بزن.")
        return

    if await db.tenant_exists(token):
        await message.answer("این توکن قبلاً توی سیستم ثبت شده.")
        await state.clear()
        return

    data = await state.get_data()
    tpl_id = data.get("template")
    tpl = next((t for t in templates.TEMPLATES if t.id == tpl_id), None)
    if tpl is None:
        await message.answer("خطای داخلی: قالب پیدا نشد. /newbot")
        await state.clear()
        return

    await state.update_data(token=token, bot_username=me.username, bot_name=me.full_name)
    if tpl.needs_owner_id:
        await state.set_state(NewBot.waiting_owner)
        await message.answer(
            f"توکن درسته ✅ (@{me.username})\n\n"
            "یوزرآیدی ادمین این ربات رو بفرست (عدد).\n"
            "معمولاً خودتی — یوزرآیدی خودت رو از @userinfobot بپرس.",
        )
    else:
        await _build_bot(message, state, owner_id=message.from_user.id)


@router.message(NewBot.waiting_owner, F.text)
async def got_owner(message: Message, state: FSMContext):
    try:
        owner_id = int(message.text.strip().lstrip("+-"))
    except ValueError:
        await message.answer("یه عدد معتبر بفرست، مثل: 5849459134")
        return
    if owner_id < 1:
        await message.answer("یه عدد معتبر بفرست، مثل: 5849459134")
        return
    await _build_bot(message, state, owner_id=owner_id)


async def _build_bot(message: Message, state: FSMContext, owner_id: int):
    data = await state.get_data()
    tpl_id = data["template"]
    tpl = next((t for t in templates.TEMPLATES if t.id == tpl_id), None)
    cfg = templates.base_config_for(tpl)

    tenant_id = await db.add_tenant(
        owner_id=owner_id,
        token=data["token"],
        username=data["bot_username"],
        name=data["bot_name"],
        template=tpl_id,
        cfg=cfg,
    )
    ok = await start_tenant(tenant_id)
    await state.clear()
    if ok:
        await message.answer(
            f"رباتت آماده‌ست! 🎉\n"
            f"• نوع: {tpl.name}\n"
            f"• یوزرنیم: @{data['bot_username']}\n"
            f"• ادمین: {owner_id}\n\n"
            f"توی خودِ رباتت /panel بزن تا پنل مدیریتت باز بشه.\n{tpl.setup_hint}",
        )
    else:
        await message.answer("ربات ثبت شد ولی اجراش فعلاً ممکن نشد — بعداً خودکار تلاش می‌کنم.")


@router.message(Command("cancel"))
async def on_cancel(message: Message, state: FSMContext):
    await state.clear()
    await message.answer("انجام شد / لغو شد.")


@router.message(Command("mybots"))
async def on_mybots(message: Message):
    owned = await db.get_tenants_by_owner(message.from_user.id)
    if not owned:
        await message.answer("هنوز رباتی نساختی. /newbot")
        return
    lines = []
    for t in owned:
        state_txt = "✅ فعال" if t["active"] else "❌ غیرفعال"
        lines.append(f"#{t['id']} @{t['username']} — {state_txt}")
    lines.append("\nحذف: /delbot <شماره>")
    await message.answer("\n".join(lines))


@router.message(Command("delbot"))
async def on_delbot(message: Message):
    parts = message.text.split()
    if len(parts) != 2 or not parts[1].isdigit():
        await message.answer("مثال: /delbot 3")
        return
    tenant = await db.get_tenant(int(parts[1]))
    if not tenant or tenant["owner_id"] != message.from_user.id:
        await message.answer("چنین رباتی نداری.")
        return
    await stop_tenant(tenant["id"])
    await db.delete_tenant(tenant["id"])
    await message.answer(f"ربات @{tenant['username']} حذف شد.")


@router.callback_query(F.data == "factory:newbot")
async def cb_newbot(callback, state: FSMContext):
    await callback.answer()
    await on_newbot(callback.message, state)


@router.callback_query(F.data == "factory:mybots")
async def cb_mybots(callback):
    await callback.answer()
    await on_mybots(callback.message)
