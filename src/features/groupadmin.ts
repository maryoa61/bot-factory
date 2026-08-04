/** Feature: group admin — kick/ban/mute, antilink, bad-words filter, welcome message.
 *  Covers the `groupadmin`, `antispam` and `welcome` templates. */

import type { Bot, Context } from "grammy";

import { hasLink } from "../templates";
import type { TenantCtx } from "../panel";

function arg(ctx: Context): string {
  return typeof ctx.match === "string" ? ctx.match.trim() : "";
}

async function isAdmin(bot: Bot, chatId: number, userId: number): Promise<boolean> {
  try {
    const m = await bot.api.getChatMember(chatId, userId);
    return ["administrator", "creator"].includes(m.status);
  } catch {
    return false;
  }
}

export function registerGroupAdmin(bot: Bot, t: TenantCtx): void {
  const hasGroupAdmin = t.feature("groupadmin");
  const hasAntispam = t.feature("antispam");
  const hasWelcome = t.feature("welcome");
  if (!hasGroupAdmin && !hasAntispam && !hasWelcome) return;

  if (!t.config.badWords) t.config.badWords = [];

  // ---------- moderation (groupadmin template) ----------
  if (hasGroupAdmin) {
    bot.command("kick", async (ctx) => {
      if (!ctx.from || !ctx.message) return;
      if (!(await isAdmin(bot, ctx.chat.id, ctx.from.id))) return;
      const target = ctx.message.reply_to_message?.from?.id;
      if (!target) return ctx.reply("روی پیام کسی ریپلای کن.");
      try {
        await bot.api.banChatMember(ctx.chat.id, target);
        await bot.api.unbanChatMember(ctx.chat.id, target);
        await ctx.reply("👢 کیک شد.");
      } catch {
        await ctx.reply("ربات ادمین نیست یا خطایی رخ داد.");
      }
    });

    bot.command("ban", async (ctx) => {
      if (!ctx.from || !ctx.message) return;
      if (!(await isAdmin(bot, ctx.chat.id, ctx.from.id))) return;
      const target = ctx.message.reply_to_message?.from?.id;
      if (!target) return ctx.reply("روی پیام کسی ریپلای کن.");
      try {
        await bot.api.banChatMember(ctx.chat.id, target);
        await ctx.reply("🚫 بن شد.");
      } catch {
        await ctx.reply("ربات ادمین نیست یا خطایی رخ داد.");
      }
    });

    bot.command("unban", async (ctx) => {
      if (!ctx.from) return;
      if (!(await isAdmin(bot, ctx.chat.id, ctx.from.id))) return;
      const parts = arg(ctx).split(/\s+/);
      const id = parts[0] && /^\d+$/.test(parts[0]) ? Number(parts[0]) : null;
      if (!id) return ctx.reply("مثال: /unban 123456789");
      try {
        await bot.api.unbanChatMember(ctx.chat.id, id);
        await ctx.reply("✅ آنبن شد.");
      } catch {
        await ctx.reply("خطایی رخ داد.");
      }
    });

    bot.command("mute", async (ctx) => {
      if (!ctx.from || !ctx.message) return;
      if (!(await isAdmin(bot, ctx.chat.id, ctx.from.id))) return;
      const target = ctx.message.reply_to_message?.from?.id;
      if (!target) return ctx.reply("روی پیام کسی ریپلای کن.");
      try {
        await bot.api.restrictChatMember(ctx.chat.id, target, { can_send_messages: false });
        await ctx.reply("🔇 میوت شد.");
      } catch {
        await ctx.reply("ربات ادمین نیست یا خطایی رخ داد.");
      }
    });

    bot.command("unmute", async (ctx) => {
      if (!ctx.from || !ctx.message) return;
      if (!(await isAdmin(bot, ctx.chat.id, ctx.from.id))) return;
      const target = ctx.message.reply_to_message?.from?.id;
      if (!target) return ctx.reply("روی پیام کسی ریپلای کن.");
      try {
        await bot.api.restrictChatMember(ctx.chat.id, target, { can_send_messages: true });
        await ctx.reply("🔊 آنمیوت شد.");
      } catch {
        await ctx.reply("ربات ادمین نیست یا خطایی رخ داد.");
      }
    });
  }

  // ---------- channel posting (groupadmin template) ----------
  if (hasGroupAdmin) {
    bot.command("setchannel", async (ctx) => {
      if (!ctx.from || !t.isOwner(ctx.from.id)) return;
      const raw = arg(ctx);
      if (!raw) return ctx.reply("مثال: /setchannel @mychannel");
      const target = /^\d+$/.test(raw) ? Number(raw) : raw;
      try {
        const chat = await bot.api.getChat(target);
        t.config.channel = chat.id;
        await t.save(bot);
        await ctx.reply(
          `✅ کانال «${chat.title ?? chat.username ?? chat.id}» تنظیم شد.\n` +
            `حالا /post <متن> بفرست تا توش پست بذاری.`
        );
      } catch {
        await ctx.reply("کانال پیدا نشد — مطمئن شو ربات ادمینشه و @ یا آیدی عددی بفرست.");
      }
    });

    bot.command("post", async (ctx) => {
      if (!ctx.from || !t.isOwner(ctx.from.id)) return;
      const text = arg(ctx);
      if (!text) return ctx.reply("مثال: /post سلام دنیا 🚀");
      const ch = t.config.channel;
      if (!ch) return ctx.reply("اول /setchannel @channel رو بزن.");
      try {
        await bot.api.sendMessage(ch, text);
        await ctx.reply("✅ پست توی کانال ارسال شد.");
      } catch {
        await ctx.reply("ارسال نشد — ربات ادمین کاناله؟");
      }
    });
  }

  // ---------- antilink + bad words (groupadmin / antispam templates) ----------
  if (hasGroupAdmin || hasAntispam) {
    bot.command("antilink", async (ctx) => {
      if (!ctx.from || !t.isOwner(ctx.from.id)) return;
      const v = arg(ctx).toLowerCase();
      if (v !== "on" && v !== "off") return ctx.reply("مثال: /antilink on  یا  /antilink off");
      t.config.antilink = v === "on";
      await t.save(bot);
      await ctx.reply(`✅ آنتی‌لینک: ${v === "on" ? "روشن" : "خاموش"}`);
    });

    bot.command("addword", async (ctx) => {
      if (!ctx.from || !t.isOwner(ctx.from.id)) return;
      const w = arg(ctx);
      if (!w) return ctx.reply("مثال: /addword فحش");
      if (!t.config.badWords!.includes(w)) t.config.badWords!.push(w);
      await t.save(bot);
      await ctx.reply(`✅ کلمه «${w}» به لیست اضافه شد.`);
    });

    bot.on("message", async (ctx, next) => {
      const chat = ctx.chat;
      if (chat.type !== "group" && chat.type !== "supergroup") return next();
      if (!ctx.message?.text) return next();
      const sender = ctx.message.from;
      if (!sender || (await isAdmin(bot, chat.id, sender.id))) return next();

      const text = ctx.message.text;
      let bad = false;
      if (t.config.antilink && hasLink(text)) bad = true;
      if (!bad && t.config.badWords!.some((w) => text.includes(w))) bad = true;

      if (bad) {
        try {
          await bot.api.deleteMessage(chat.id, ctx.message.message_id);
          const warn = await bot.api.sendMessage(chat.id, `🚫 پیام ${sender.first_name} حذف شد (ضداسپم).`);
          setTimeout(() => bot.api.deleteMessage(chat.id, warn.message_id).catch(() => {}), 5000);
        } catch {
          // bot not admin
        }
      }
      return next();
    });
  }

  // ---------- welcome (groupadmin / welcome templates) ----------
  if (hasGroupAdmin || hasWelcome) {
    bot.command("setwelcome", async (ctx) => {
      if (!ctx.from || !t.isOwner(ctx.from.id)) return;
      const text = arg(ctx);
      if (!text) return ctx.reply("مثال: /setwelcome خوش اومدی {name} 👋");
      t.config.welcomeText = text;
      await t.save(bot);
      await ctx.reply("✅ متن خوش‌آمد تنظیم شد.");
    });

    bot.on("chat_member", async (ctx) => {
      const u = ctx.update.chat_member;
      const becameMember =
        u.new_chat_member.status === "member" &&
        u.old_chat_member.status !== "member" &&
        u.old_chat_member.status !== "administrator";
      if (!becameMember) return;
      if (!t.config.welcomeText) return;
      const name = u.new_chat_member.user.first_name;
      try {
        await ctx.api.sendMessage(u.chat.id, t.config.welcomeText.replace(/\{name\}/g, name));
      } catch {
        // bot not admin / chat gone
      }
    });
  }
}
