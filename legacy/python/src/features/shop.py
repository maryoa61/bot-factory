"""Shop feature: products + purchase via Telegram Stars (XTR)."""

from aiogram import Bot, F, Router
from aiogram.filters import Command
from aiogram.types import (
    CallbackQuery,
    LabeledPrice,
    Message,
    PreCheckoutQuery,
)

from .. import db

MAX_STARS = 2500


def build_router(tenant_id: int) -> Router:
    router = Router(name=f"sh-{tenant_id}")

    async def owner(message: Message) -> bool:
        t = await db.get_tenant(tenant_id)
        return bool(t and t["owner_id"] == message.from_user.id)

    # ---- owner: manage products ----

    @router.message(Command("addproduct"))
    async def add_product(message: Message):
        if not await owner(message):
            return
        cfg = await db.get_config(tenant_id)
        if not cfg["features"].get("shop"):
            return await message.answer("ربات تو این قابلیت رو نداره.")
        parts = message.text.replace("/addproduct", "", 1).split("|")
        if len(parts) < 2:
            return await message.answer("مثال: /addproduct اسم محصول|۵|توضیح کوتاه")
        try:
            stars = int(parts[1].strip().replace(",", ""))
        except ValueError:
            return await message.answer("قیمت باید عدد باشه (تعداد ستاره).")
        if not (1 <= stars <= MAX_STARS):
            return await message.answer(f"ستاره باید بین ۱ تا {MAX_STARS} باشه.")
        pid = (max([p["id"] for p in cfg["products"]], default=0)) + 1
        cfg["products"].append(
            {"id": pid, "name": parts[0].strip(), "stars": stars, "desc": parts[2].strip() if len(parts) > 2 else ""}
        )
        await db.save_config(tenant_id, cfg)
        await message.answer(f"✅ محصول «{parts[0].strip()}» با {stars} ستاره اضافه شد.")

    @router.message(Command("listproducts"))
    async def list_products(message: Message):
        if not await owner(message):
            return
        cfg = await db.get_config(tenant_id)
        if not cfg["products"]:
            return await message.answer("هنوز محصولی نداری. /addproduct")
        lines = [f"#{p['id']} {p['name']} — ⭐{p['stars']}" for p in cfg["products"]]
        await message.answer("\n".join(lines) + "\n\nحذف: /delproduct <شماره>")

    @router.message(Command("delproduct"))
    async def del_product(message: Message):
        if not await owner(message):
            return
        cfg = await db.get_config(tenant_id)
        parts = message.text.split()
        if len(parts) != 2 or not parts[1].isdigit():
            return await message.answer("مثال: /delproduct 1")
        pid = int(parts[1])
        before = len(cfg["products"])
        cfg["products"] = [p for p in cfg["products"] if p["id"] != pid]
        if len(cfg["products"]) == before:
            return await message.answer("چنین محصولی نیست.")
        await db.save_config(tenant_id, cfg)
        await message.answer("✅ حذف شد.")

    # ---- users: browse & buy ----

    @router.message(Command("shop"))
    async def show_shop(message: Message):
        cfg = await db.get_config(tenant_id)
        if not cfg["features"].get("shop"):
            return await message.answer("فروشگاهی فعال نیست.")
        if not cfg["products"]:
            return await message.answer("فعلاً محصولی موجود نیست.")
        lines = [f"{p['name']} — ⭐{p['stars']}\n{p['desc']}" for p in cfg["products"]]
        kb = None
        from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
        kb = InlineKeyboardMarkup(
            inline_keyboard=[[InlineKeyboardButton(text="🛒 خرید", callback_data=f"sh:buy:{p['id']}")] for p in cfg["products"]]
        )
        await message.answer("\n\n".join(lines), reply_markup=kb)

    @router.callback_query(F.data.startswith("sh:buy:"))
    async def buy(callback: CallbackQuery):
        pid = int(callback.data.split(":")[2])
        cfg = await db.get_config(tenant_id)
        product = next((p for p in cfg["products"] if p["id"] == pid), None)
        if not product:
            return await callback.answer("محصول پیدا نشد.", show_alert=True)
        await callback.answer()
        await callback.message.answer_invoice(
            title=product["name"],
            description=product["desc"] or product["name"],
            payload=f"shop:{pid}",
            currency="XTR",
            prices=[LabeledPrice(label=product["name"], amount=product["stars"])],
            provider_token="",
        )

    @router.pre_checkout_query()
    async def pre_checkout(q: PreCheckoutQuery):
        await q.answer(ok=True)

    @router.message(F.successful_payment)
    async def paid(message: Message):
        sp = message.successful_payment
        await message.answer(f"✅ پرداخت موفق! {sp.total_amount} ⭐\nمحصول: {sp.invoice_payload}")
        t = await db.get_tenant(tenant_id)
        if t:
            await message.bot.send_message(
                t["owner_id"],
                f"🛒 خرید جدید!\nکاربر: {message.from_user.full_name} (id: {message.from_user.id})\n"
                f"مبلغ: {sp.total_amount} ⭐\nپیمایش: {sp.invoice_payload}",
            )

    return router
