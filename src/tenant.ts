/** Tenant bot: assembled from the template's enabled features + admin panel. */

import { Bot, InlineKeyboard } from "grammy";

import type { Env } from "./env";
import { addUser } from "./registry";
import type { TenantRow } from "./registry";
import { TenantCtx, registerPanelCallbacks, sendPanel } from "./panel";
import { registerAutoreply } from "./features/autoreply";
import { registerShop } from "./features/shop";
import { joinerGate, registerJoiner } from "./features/joiner";
import { registerGroupAdmin } from "./features/groupadmin";
import { registerBroadcast } from "./features/broadcast";
import { registerPoll } from "./features/poll";
import { cardStartText, registerCard } from "./features/card";
import { registerForward } from "./features/forward";

export function buildTenantBot(env: Env, tenant: TenantRow): Bot {
  const bot = new Bot(tenant.token);
  const t = new TenantCtx(env, tenant);

  bot.command("start", async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    await addUser(env.REGISTRY, tenant.id, from.id);
    if (t.feature("joiner")) {
      const pass = await joinerGate(ctx, t);
      if (!pass) return;
    }
    const cardText = cardStartText(t);
    const text =
      cardText ??
      t.config.defaultReply ??
      `سلام ${from.first_name}! 👋 به @${tenant.username} خوش اومدی.`;
    await ctx.reply(text, {
      reply_markup: new InlineKeyboard().text("📊 پنل مدیریت", "tn:panel"),
    });
  });

  bot.command("panel", async (ctx) => {
    const from = ctx.from;
    const chatId = ctx.chat?.id;
    if (!from || !chatId) return;
    if (!t.isOwner(from.id)) {
      await ctx.reply("فقط ادمین دسترسی داره.");
      return;
    }
    await sendPanel(bot, chatId, t);
  });

  bot.callbackQuery("tn:panel", async (ctx) => {
    await ctx.answerCallbackQuery();
    const from = ctx.from;
    const chatId = ctx.chat?.id;
    if (!from || !chatId || !t.isOwner(from.id)) return;
    await sendPanel(bot, chatId, t);
  });

  registerPanelCallbacks(bot, t);

  // ---- features (only the ones enabled for this template) ----
  if (t.feature("autoreply")) registerAutoreply(bot, t);
  if (t.feature("shop")) registerShop(bot, t);
  if (t.feature("joiner")) registerJoiner(bot, t);
  if (t.feature("groupadmin") || t.feature("antispam") || t.feature("welcome")) registerGroupAdmin(bot, t);
  if (t.feature("broadcast")) registerBroadcast(bot, t);
  if (t.feature("poll")) registerPoll(bot, t);
  if (t.feature("card")) registerCard(bot, t);
  if (t.feature("forward")) registerForward(bot, t);

  return bot;
}
