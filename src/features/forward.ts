/** Feature: forward — auto-forward messages from a source channel/group to a destination. */

import type { Bot } from "grammy";

import type { TenantCtx } from "../panel";

export function registerForward(bot: Bot, t: TenantCtx): void {
  bot.command("setforward", async (ctx) => {
    if (!ctx.from || !t.isOwner(ctx.from.id)) return;
    const raw = typeof ctx.match === "string" ? ctx.match.trim() : "";
    const [src, dst] = raw.split("|").map((s) => s.trim());
    if (!src || !dst) {
      return ctx.reply("مثال: /setforward @کانل-مبدا|@کانال-مقصد");
    }
    try {
      const srcChat = await ctx.api.getChat(src);
      const dstChat = await ctx.api.getChat(dst);
      t.config.forward = { src: srcChat.id, dst: dstChat.id };
      await t.save(bot);
      await ctx.reply(
        `✅ فوروارد فعال شد:\n${srcChat.title ?? src} → ${dstChat.title ?? dst}\n` +
          `(ربات باید در هر دو ادمین باشه)`
      );
    } catch {
      await ctx.reply("کانال/گروه پیدا نشد — مطمئن شو ربات ادمینشه و @ بفرست.");
    }
  });

  bot.command("fwd", async (ctx) => {
    if (!ctx.from || !t.isOwner(ctx.from.id)) return;
    const v = typeof ctx.match === "string" ? ctx.match.trim() : "";
    if (v === "off") {
      t.config.forward = null;
      await t.save(bot);
      await ctx.reply("✅ فوروارد غیرفعال شد.");
      return;
    }
    await ctx.reply(t.config.forward ? "فوروارد فعاله ✅" : "فوروارد غیرفعاله. /setforward @مبدا|@مقصد");
  });

  bot.on("channel_post", async (ctx) => {
    const f = t.config.forward;
    if (!f || ctx.chat.id !== f.src) return;
    const post = ctx.channelPost;
    if (!post) return;
    try {
      await ctx.api.forwardMessage(f.dst, f.src, post.message_id);
    } catch {
      // bot not admin in one of them — keep silent, config shows status
    }
  });
}
