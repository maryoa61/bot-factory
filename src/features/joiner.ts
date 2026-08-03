/** Feature: joiner — forced membership gate before using the bot. */

import { InlineKeyboard } from "grammy";
import type { Bot, Context } from "grammy";

import type { TenantCtx } from "../panel";

/** Returns true when the user passed the gate (or no channel is set). */
export async function joinerGate(ctx: Context, t: TenantCtx): Promise<boolean> {
  const from = ctx.from;
  if (!from) return true;
  const ch = t.config.channel;
  if (!ch) return true;
  try {
    const member = await ctx.api.getChatMember(ch, from.id);
    const ok = ["member", "administrator", "creator"].includes(member.status);
    if (ok) return true;
  } catch {
    // channel unknown / bot not admin — don't block users on config errors
    return true;
  }
  const kb = new InlineKeyboard();
  const chat = await ctx.api.getChat(ch).catch(() => null);
  const username = typeof chat?.username === "string" ? chat.username : String(ch).replace(/^-100/, "");
  kb.url("🔗 عضویت", `https://t.me/${username}`);
  kb.text("✅ عضو شدم", "jn:check");
  await ctx.reply("برای استفاده از ربات اول باید عضو کانال بشی 👇", { reply_markup: kb });
  return false;
}

export function registerJoiner(bot: Bot, t: TenantCtx): void {
  bot.command("setchannel", async (ctx) => {
    if (!ctx.from || !t.isOwner(ctx.from.id)) return;
    const raw = typeof ctx.match === "string" ? ctx.match.trim() : "";
    if (!raw) {
      await ctx.reply("مثال: /setchannel @mychannel");
      return;
    }
    const target = /^\d+$/.test(raw) ? Number(raw) : raw;
    try {
      const chat = await ctx.api.getChat(target);
      t.config.channel = chat.id;
      await t.save(bot);
      await ctx.reply(`✅ گیت عضویت روی «${chat.title ?? chat.username ?? chat.id}» تنظیم شد.\nربات رو ادمین کانال کن.`);
    } catch {
      await ctx.reply("کانال پیدا نشد — مطمئن شو ربات ادمینشه و @ یا آیدی عددی بفرست.");
    }
  });

  bot.callbackQuery("jn:check", async (ctx) => {
    await ctx.answerCallbackQuery();
    const pass = await joinerGate(ctx, t);
    if (pass) {
      await ctx.reply("عضویت تأیید شد ✅ خوش اومدی!");
    }
  });
}
