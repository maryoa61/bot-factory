/** Feature: autoreply — keyword → reply, plus default reply. */

import type { Bot } from "grammy";

import type { TenantCtx } from "../panel";

function arg(ctx: { match?: string | RegExpMatchArray | undefined }): string {
  return typeof ctx.match === "string" ? ctx.match.trim() : "";
}

export function registerAutoreply(bot: Bot, t: TenantCtx): void {
  if (!t.config.replies) t.config.replies = {};

  bot.command("addreply", async (ctx) => {
    if (!ctx.from || !t.isOwner(ctx.from.id)) return;
    const parts = arg(ctx).split("|");
    if (parts.length < 2 || !parts[0].trim()) {
      await ctx.reply("مثال: /addreply قیمت|قیمت ما ۵۰ هزار تومنه");
      return;
    }
    t.config.replies![parts[0].trim()] = parts.slice(1).join("|").trim();
    await t.save(bot);
    await ctx.reply(`✅ ثبت شد: «${parts[0].trim()}»`);
  });

  bot.command("delreply", async (ctx) => {
    if (!ctx.from || !t.isOwner(ctx.from.id)) return;
    const key = arg(ctx);
    if (key === "*") {
      t.config.replies = {};
      await t.save(bot);
      await ctx.reply("✅ همه‌ی پاسخ‌ها حذف شد.");
      return;
    }
    if (key && t.config.replies![key]) {
      delete t.config.replies![key];
      await t.save(bot);
      await ctx.reply(`✅ «${key}» حذف شد.`);
    } else {
      await ctx.reply("چنین کلیدواژه‌ای نیست. /panel بزن و لیست رو ببین.");
    }
  });

  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;
    if (!t.feature("autoreply")) return;
    const text = ctx.message.text.trim();
    for (const [key, reply] of Object.entries(t.config.replies ?? {})) {
      if (text.includes(key)) {
        await ctx.reply(reply);
        return;
      }
    }
    // fallback: only in private chats, and only when no other feature answers
    if (ctx.chat.type === "private" && t.config.defaultReply) {
      await ctx.reply(t.config.defaultReply);
    }
  });
}
