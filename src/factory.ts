/** Factory bot: user describes the bot -> token (+owner id) -> custom bot delivered.
 *  Conversation state lives in D1 (`pending` table), so the worker is stateless. */

import { Bot, InlineKeyboard } from "grammy";
import type { Context } from "grammy";

import type { Env } from "./env";
import * as db from "./registry";
import type { PendingRow } from "./registry";
import { TEMPLATES, baseConfigFor, matchRequest, templateById } from "./templates";

const ALLOWED_UPDATES = [
  "message",
  "callback_query",
  "chat_member",
  "channel_post",
  "pre_checkout_query",
] as const;

export function makeFactoryBot(env: Env, baseUrl: string): Bot {
  const bot = new Bot(env.MAIN_BOT_TOKEN);

  bot.command("start", async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    await ctx.reply(
      "سلام! 🤖 من کارخونه‌ی ربات‌سازم.\n\n" +
        "بگو چه رباتی می‌خوای — مثلاً:\n" +
        "«یه ربات فروشگاه می‌خوام»\n" +
        "«ربات پاسخگوی خودکار»\n" +
        "«ربات جوینر برای کانالم»\n" +
        "«مدیریت گروه»\n\n" +
        "الان از این ربات‌ها پشتیبانی می‌کنم:\n" +
        templatesText() +
        "\n\nبزن /newbot تا شروع کنیم.",
      { reply_markup: mainPanel() }
    );
  });

  bot.command("newbot", async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    const owned = await db.listByOwner(env.DB, from.id);
    const max = env.MAX_BOTS_PER_USER ?? 5;
    if (owned.length >= max) {
      await ctx.reply(`حداکثر ${max} ربات می‌تونی بسازی.`);
      return;
    }
    await db.clearPending(env.DB, from.id);
    await db.savePending(env.DB, from.id, { step: "request" });
    await ctx.reply(
      "چه رباتی می‌خوای؟ 🔍\n" +
        "درخواستت رو یه جمله بنویس، مثلاً:\n" +
        "«یه ربات می‌خوام که به مشتری‌هام خودکار جواب بده»\n\n" +
        "اگه مطمئن نیستی: /list بزن تا لیست ربات‌های آماده رو ببینی."
    );
  });

  bot.command("list", async (ctx) => {
    await ctx.reply("ربات‌هایی که می‌تونم بسازم:\n\n" + templatesText());
  });

  bot.command("mybots", async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    await mybotsReply(ctx, env, from.id);
  });

  bot.command("delbot", async (ctx) => {
    const from = ctx.from;
    if (!from || !ctx.message) return;
    const parts = ctx.message.text.split(/\s+/);
    if (parts.length !== 2 || !/^\d+$/.test(parts[1])) {
      await ctx.reply("مثال: /delbot 3");
      return;
    }
    const tenant = await db.getTenantById(env.DB, Number(parts[1]));
    if (!tenant || tenant.owner_id !== from.id) {
      await ctx.reply("چنین رباتی نداری.");
      return;
    }
    try {
      await new Bot(tenant.token).api.deleteWebhook();
    } catch {
      // ignore
    }
    await db.deleteTenant(env.DB, tenant.id);
    await ctx.reply(`ربات @${tenant.username ?? "?"} حذف شد.`);
  });

  bot.command("cancel", async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    await db.clearPending(env.DB, from.id);
    await ctx.reply("انجام شد / لغو شد.");
  });

  bot.callbackQuery(/^factory:(.+)$/, async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    const action = ctx.match[1];
    await ctx.answerCallbackQuery();
    if (action === "newbot") {
      await db.clearPending(env.DB, from.id);
      await db.savePending(env.DB, from.id, { step: "request" });
      await ctx.reply("چه رباتی می‌خوای؟ 🔍\nدرخواستت رو یه جمله بنویس.");
    } else if (action === "mybots") {
      await mybotsReply(ctx, env, from.id);
    } else if (action === "confirm") {
      await db.savePending(env.DB, from.id, { step: "token" });
      await ctx.reply("توکن رباتت رو بفرست:\nاز @BotFather → /newbot → اسم ربات → توکن رو اینجا کپی کن.");
    } else if (action === "change") {
      await db.savePending(env.DB, from.id, { step: "request", template: null });
      await ctx.reply("اوکی، دوباره بگو چه رباتی می‌خوای:");
    }
  });

  bot.on("message:text", async (ctx) => {
    const from = ctx.from;
    if (!from || !ctx.message.text) return;
    if (ctx.message.text.startsWith("/")) return; // handled by command handlers
    const pend = await db.getPending(env.DB, from.id);
    if (!pend) return;
    await handlePendingText(ctx, env, baseUrl, pend, from.id);
  });

  return bot;
}

function templatesText(): string {
  return TEMPLATES.map((t, i) => `${i + 1}. ${t.name} — ${t.desc}`).join("\n");
}

function mainPanel() {
  return new InlineKeyboard()
    .text("🤖 ربات جدید", "factory:newbot")
    .text("📋 ربات‌های من", "factory:mybots");
}

async function mybotsReply(ctx: Context, env: Env, userId: number): Promise<void> {
  const owned = await db.listByOwner(env.DB, userId);
  if (!owned.length) {
    await ctx.reply("هنوز رباتی نساختی. /newbot");
    return;
  }
  const lines = owned.map((t) => {
    const st = t.active ? "✅ فعال" : "❌ غیرفعال";
    return `#${t.id} @${t.username ?? "?"} — ${st}`;
  });
  lines.push("", "حذف: /delbot <شماره>");
  await ctx.reply(lines.join("\n"));
}

async function handlePendingText(
  ctx: Context,
  env: Env,
  baseUrl: string,
  pend: PendingRow,
  userId: number
): Promise<void> {
  if (!ctx.message?.text) return;
  const text = ctx.message.text.trim();

  if (pend.step === "request") {
    const { template, score } = matchRequest(text);
    if (!template || score === 0) {
      await ctx.reply("نتونستم بفهمم چه رباتی می‌خوای 🤔\nیه توضیح ساده‌تر بده یا /list بزن و اسم یه ربات رو بنویس.");
      return;
    }
    await db.savePending(env.DB, userId, { step: "confirm", template: template.id });
    await ctx.reply(
      `فهمیدم! ✅ ربات «${template.name}»\n${template.desc}\n\n📌 ${template.setupHint}\n\nدرست بود؟`,
      {
        reply_markup: new InlineKeyboard()
          .text("✅ درسته، بده توکن", "factory:confirm")
          .text("↩️ عوض کن", "factory:change"),
      }
    );
    return;
  }

  if (pend.step === "confirm") {
    await ctx.reply("روی دکمه‌ها بزن — «✅ درسته» یا «↩️ عوض کن». یا /cancel");
    return;
  }

  if (pend.step === "token") {
    const token = text;
    if (!token.includes(":") || token.length < 20) {
      await ctx.reply("این توکن معتبر به نظر نمی‌رسه. دوباره بفرست یا /cancel بزن.");
      return;
    }
    let username = "";
    let name = "";
    try {
      const probe = new Bot(token);
      const me = await probe.api.getMe();
      username = me.username ?? "";
      name = me.first_name;
    } catch (e) {
      await ctx.reply(`توکن رد شد: ${String(e)}\nدوباره بفرست یا /cancel بزن.`);
      return;
    }
    if (await db.getTenantByToken(env.DB, token)) {
      await ctx.reply("این توکن قبلاً توی سیستم ثبت شده.");
      await db.clearPending(env.DB, userId);
      return;
    }
    const tpl = templateById(pend.template ?? "");
    await db.savePending(env.DB, userId, {
      step: tpl?.needsOwnerId ? "owner" : "done",
      token,
      username,
      name,
    });
    if (tpl?.needsOwnerId) {
      await ctx.reply(
        `توکن درسته ✅ (@${username})\n\nیوزرآیدی ادمین این ربات رو بفرست (عدد).\nمعمولاً خودتی — یوزرآیدی خودت رو از @userinfobot بپرس.`
      );
    } else {
      const fresh = await db.getPending(env.DB, userId);
      if (fresh) await buildBot(ctx, env, baseUrl, fresh);
    }
    return;
  }

  if (pend.step === "owner") {
    const raw = text.replace(/^[+-]/, "");
    if (!/^\d+$/.test(raw)) {
      await ctx.reply("یه عدد معتبر بفرست، مثل: 5849459134");
      return;
    }
    const ownerId = Number(raw);
    if (ownerId < 1) {
      await ctx.reply("یه عدد معتبر بفرست، مثل: 5849459134");
      return;
    }
    await db.savePending(env.DB, userId, { step: "done", owner: ownerId });
    const fresh = await db.getPending(env.DB, userId);
    if (fresh) await buildBot(ctx, env, baseUrl, fresh);
  }
}

async function buildBot(ctx: Context, env: Env, baseUrl: string, pend: PendingRow): Promise<void> {
  const from = ctx.from;
  if (!from) return;
  const tpl = templateById(pend.template ?? "");
  if (!tpl || !pend.token) {
    await ctx.reply("خطای داخلی: قالب پیدا نشد. /newbot");
    await db.clearPending(env.DB, from.id);
    return;
  }
  const cfg = baseConfigFor(tpl);
  const hookSecret = crypto.randomUUID();
  const ownerId = pend.owner ?? from.id;

  await db.addTenant(env.DB, {
    owner_id: ownerId,
    token: pend.token,
    username: pend.username ?? "",
    name: pend.name ?? "",
    template: tpl.id,
    config: JSON.stringify(cfg),
    hook_secret: hookSecret,
  });

  const webhookUrl = `${baseUrl}/wh/${encodeURIComponent(pend.token)}`;
  let webhookOk = false;
  try {
    const probe = new Bot(pend.token);
    await probe.api.setWebhook(webhookUrl, {
      secret_token: hookSecret,
      allowed_updates: ALLOWED_UPDATES,
    });
    webhookOk = true;
  } catch (e) {
    console.error("setWebhook failed:", String(e));
  }

  await db.clearPending(env.DB, from.id);

  if (webhookOk) {
    await ctx.reply(
      `رباتت آماده‌ست! 🎉\n` +
        `• نوع: ${tpl.name}\n` +
        `• یوزرنیم: @${pend.username}\n` +
        `• ادمین: ${ownerId}\n\n` +
        `توی خودِ رباتت /panel بزن تا پنل مدیریتت باز بشه.\n${tpl.setupHint}`
    );
  } else {
    await ctx.reply(
      `ربات ${tpl.name} ثبت شد ولی اتصال وب‌هوکش فعلاً ممکن نشد.\n` +
        `بعداً /mybots بزن و دوباره تلاش کن (یا لاگ Worker را ببین).`
    );
  }
}
