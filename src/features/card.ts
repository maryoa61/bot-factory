/** Feature: card / business card — /setinfo, /info, shown on /start. */

import type { Bot } from "grammy";

import type { TenantCtx } from "../panel";

export function registerCard(bot: Bot, t: TenantCtx): void {
  bot.command("setinfo", async (ctx) => {
    if (!ctx.from || !t.isOwner(ctx.from.id)) return;
    const text = typeof ctx.match === "string" ? ctx.match.trim() : "";
    if (!text) return ctx.reply("مثال: /setinfo محمد — برنامه‌نویس\nوبسایت: example.com");
    t.config.cardInfo = text;
    await t.save(bot);
    await ctx.reply("✅ کارت ویزیت تنظیم شد.");
  });

  bot.command("info", async (ctx) => {
    await ctx.reply(t.config.cardInfo ?? t.config.defaultReply ?? "سلام! 👋");
  });
}

export function cardStartText(t: TenantCtx): string | null {
  if (t.feature("card") && t.config.cardInfo) return t.config.cardInfo;
  return null;
}
