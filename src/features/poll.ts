/** Feature: poll — /poll question|opt1|opt2|... */

import type { Bot } from "grammy";

import type { TenantCtx } from "../panel";

export function registerPoll(bot: Bot, t: TenantCtx): void {
  bot.command("poll", async (ctx) => {
    const raw = typeof ctx.match === "string" ? ctx.match.trim() : "";
    const parts = raw.split("|").map((s) => s.trim()).filter(Boolean);
    if (parts.length < 3) {
      return ctx.reply("مثال: /poll بهترین رنگ چیه؟|قرمز|آبی|سبز");
    }
    const [question, ...options] = parts;
    if (options.length > 10) return ctx.reply("حداکثر ۱۰ گزینه.");
    try {
      await ctx.replyWithPoll(question, options);
    } catch {
      await ctx.reply("خطا در ساخت نظرسنجی.");
    }
  });
}
