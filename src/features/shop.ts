/** Feature: shop — products + buy with Telegram Stars (XTR). */

import { InlineKeyboard } from "grammy";
import type { Bot, Context } from "grammy";

import type { TenantCtx } from "../panel";

function arg(ctx: Context): string {
  return typeof ctx.match === "string" ? ctx.match.trim() : "";
}

export function registerShop(bot: Bot, t: TenantCtx): void {
  if (!t.config.products) t.config.products = [];

  bot.command("addproduct", async (ctx) => {
    if (!ctx.from || !t.isOwner(ctx.from.id)) return;
    const parts = arg(ctx).split("|");
    const price = Number((parts[1] ?? "").trim());
    if (parts.length < 2 || !parts[0].trim() || !Number.isFinite(price) || price < 1) {
      await ctx.reply("مثال: /addproduct کارت شارژ ۱۰۰|50  (قیمت به ستاره)");
      return;
    }
    t.config.products!.push({ name: parts[0].trim(), price: Math.round(price) });
    await t.save(bot);
    await ctx.reply(`✅ محصول اضافه شد: ${parts[0].trim()} (${Math.round(price)} ⭐)`);
  });

  bot.command("delproduct", async (ctx) => {
    if (!ctx.from || !t.isOwner(ctx.from.id)) return;
    const idx = Number(arg(ctx));
    if (!Number.isInteger(idx) || idx < 1 || idx > t.config.products!.length) {
      await ctx.reply(`مثال: /delproduct 1  —  بین ۱ تا ${t.config.products!.length}`);
      return;
    }
    const [removed] = t.config.products!.splice(idx - 1, 1);
    await t.save(bot);
    await ctx.reply(`✅ «${removed.name}» حذف شد.`);
  });

  bot.command("shop", async (ctx) => {
    await showShop(ctx, t);
  });

  bot.callbackQuery(/^pd:buy:(\d+)$/, async (ctx) => {
    const idx = Number(ctx.match[1]);
    const p = t.config.products![idx];
    if (!p) {
      await ctx.answerCallbackQuery("محصول پیدا نشد");
      return;
    }
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    try {
      await ctx.api.sendInvoice(
        chatId,
        p.name,
        `خرید ${p.name}`,
        `buy:${t.tenant.id}:${idx}`,
        "XTR",
        [{ label: p.name, amount: p.price }]
      );
    } catch (e) {
      await ctx.reply(`خطا در ساخت فاکتور: ${String(e)}`);
    }
  });

  bot.on("pre_checkout_query", async (ctx) => {
    await ctx.answerPreCheckoutQuery(true);
  });

  bot.on("message:successful_payment", async (ctx) => {
    const pay = ctx.message.successful_payment;
    await ctx.reply(
      `✅ پرداخت موفق! (${pay.total_amount} ⭐)\n` +
        `سفارش ثبت شد — تحویل به‌زودی توسط ادمین انجام می‌شه.`
    );
  });
}

async function showShop(ctx: Context, t: TenantCtx): Promise<void> {
  const products = t.config.products ?? [];
  if (!products.length) {
    await ctx.reply("🛒 فروشگاه خالیه. ادمین: /addproduct نام|قیمت");
    return;
  }
  const kb = new InlineKeyboard();
  products.forEach((p, i) => {
    kb.text(`${p.name} — ${p.price} ⭐`, `pd:buy:${i}`).row();
  });
  await ctx.reply("🛒 فروشگاه:\nبرای خرید روی محصول بزن.", { reply_markup: kb });
}
